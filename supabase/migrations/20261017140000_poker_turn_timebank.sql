-- Poker server-authoritative 10s actions and 30s one-use timebank.
-- Staging defaults: no payment processing; 0.15 IGD is a configured but disabled price.
ALTER TABLE public.poker_tables_v1
  ADD COLUMN IF NOT EXISTS turn_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS turn_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS turn_extension_used boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.poker_timebank_prices_v1 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  igd_price numeric(12,8) NOT NULL DEFAULT 0.15 CHECK (igd_price > 0),
  ign_price numeric(12,8) CHECK (ign_price > 0),
  payment_enabled boolean NOT NULL DEFAULT false,
  practice_preview_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.poker_timebank_prices_v1(singleton)
VALUES(true) ON CONFLICT(singleton) DO NOTHING;
ALTER TABLE public.poker_timebank_prices_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.poker_timebank_prices_v1 FROM anon,authenticated;

CREATE TABLE IF NOT EXISTS public.poker_timebank_receipts_v1 (
  table_id uuid NOT NULL REFERENCES public.poker_tables_v1(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  hand_no integer NOT NULL,
  turn_started_at timestamptz NOT NULL,
  currency text NOT NULL CHECK(currency IN ('PRACTICE','IGD')),
  amount numeric(12,8) NOT NULL CHECK(amount >= 0),
  wallet_transaction_id uuid,
  new_deadline_at timestamptz NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(table_id,request_id),
  UNIQUE(table_id,hand_no,turn_started_at)
);
ALTER TABLE public.poker_timebank_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.poker_timebank_receipts_v1 FROM anon,authenticated;

-- Modify old function definitions without changing unrelated settlement logic.
DO $$
DECLARE definition text; original text;
BEGIN
  SELECT pg_get_functiondef('public.poker_start_v2(uuid,uuid,jsonb,text,text,integer)'::regprocedure)
  INTO definition;
  original:=definition;
  definition:=replace(definition,
    $old$seed_secret=p_seed,hand_no=p_hand_no,board=$old$,
    $new$seed_secret=p_seed,hand_no=p_hand_no,turn_started_at=clock_timestamp(),turn_deadline_at=clock_timestamp()+interval '10 seconds',turn_extension_used=false,board=$new$);
  IF definition=original THEN RAISE EXCEPTION 'START_TURN_DEADLINE_PATCH_FAILED'; END IF;
  EXECUTE definition;

  SELECT pg_get_functiondef('public.poker_advance_v1(uuid)'::regprocedure)
  INTO definition;
  original:=definition;
  definition:=replace(definition,
    $old$turn_index=actor,current_bet=0,min_raise=big_blind,version=version+1$old$,
    $new$turn_index=actor,turn_started_at=case when actor is not null then clock_timestamp() else null end,turn_deadline_at=case when actor is not null then clock_timestamp()+interval '10 seconds' else null end,turn_extension_used=false,current_bet=0,min_raise=big_blind,version=version+1$new$);
  IF definition=original THEN RAISE EXCEPTION 'ADVANCE_TURN_DEADLINE_PATCH_FAILED'; END IF;
  EXECUTE definition;
END $$;

DO $$
DECLARE definition text;original text;
BEGIN
 SELECT pg_get_functiondef('public.poker_action_v1(uuid,uuid,uuid,bigint,text,bigint)'::regprocedure)
 INTO definition;
 original:=definition;
 definition:=replace(definition,
   $old$public.poker_action_v1(p_table uuid, p_actor uuid, p_action_id uuid, p_version bigint, p_action text, p_amount bigint DEFAULT 0)$old$,
   $new$public.poker_action_v3(p_table uuid, p_actor uuid, p_action_id uuid, p_version bigint, p_action text, p_amount bigint DEFAULT 0, p_system_timeout boolean DEFAULT false)$new$);
 definition:=replace(definition,
  $old$due=greatest(0,t.current_bet-s.street_bet);$old$,
  $new$due=greatest(0,t.current_bet-s.street_bet);
 if p_system_timeout then
  if t.turn_deadline_at is null or t.turn_deadline_at>clock_timestamp() then raise exception 'TURN_NOT_EXPIRED';end if;
  if p_action<>case when due=0 then 'check' else 'fold' end then raise exception 'BAD_TIMEOUT_ACTION';end if;
 else
  if t.turn_deadline_at is null or t.turn_deadline_at<=clock_timestamp() then raise exception 'TURN_DEADLINE_EXPIRED';end if;
 end if;$new$);
 definition:=replace(definition,
  $old$set turn_index=next_seat where id=p_table;$old$,
  $new$set turn_index=next_seat,turn_started_at=clock_timestamp(),turn_deadline_at=clock_timestamp()+interval '10 seconds',turn_extension_used=false where id=p_table;$new$);
 definition:=replace(definition,
  $old$set status='showdown',turn_index=null where id=p_table;$old$,
  $new$set status='showdown',turn_index=null,turn_started_at=null,turn_deadline_at=null,turn_extension_used=false where id=p_table;$new$);
 definition:=replace(definition,
  $old$set status='complete',turn_index=null where id=p_table;$old$,
  $new$set status='complete',turn_index=null,turn_started_at=null,turn_deadline_at=null,turn_extension_used=false where id=p_table;$new$);
 definition:=replace(definition,'end $function
   OR position('TURN_DEADLINE_EXPIRED' in definition)=0 OR
   position('turn_deadline_at=clock_timestamp()+' in definition)=0
 THEN RAISE EXCEPTION 'ACTION_DEADLINE_PATCH_FAILED'; END IF;
 EXECUTE definition;
END $$;

CREATE OR REPLACE FUNCTION public.poker_timeout_turn_v1(p_table uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.poker_tables_v1%rowtype;seat public.poker_seats_v1%rowtype;forced text;res jsonb;
BEGIN
 SELECT * INTO t FROM public.poker_tables_v1 WHERE id=p_table FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND';END IF;
 IF t.status<>'playing' OR t.turn_index IS NULL THEN
   RETURN jsonb_build_object('timedOut',false,'tableId',p_table,'version',t.version,'status',t.status);
 END IF;
 IF t.turn_deadline_at IS NULL THEN RAISE EXCEPTION 'ACTIVE_TURN_DEADLINE_MISSING'; END IF;
 IF clock_timestamp()<t.turn_deadline_at THEN
   RETURN jsonb_build_object('timedOut',false,'tableId',p_table,'version',t.version,'deadline',t.turn_deadline_at);
 END IF;
 SELECT * INTO seat FROM public.poker_seats_v1 WHERE table_id=p_table AND seat_no=t.turn_index FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_SEAT_MISSING'; END IF;
 forced=CASE WHEN seat.street_bet>=t.current_bet THEN 'check' ELSE 'fold' END;
 res=public.poker_action_v3(p_table,seat.user_id,gen_random_uuid(),t.version,forced,0,true);
 RETURN res||jsonb_build_object('timedOut',true,'autoAction',forced);
END $$;

CREATE OR REPLACE FUNCTION public.poker_buy_time_v1(
 p_table uuid,p_actor uuid,p_request uuid,p_version bigint,p_currency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.poker_tables_v1%rowtype;seat public.poker_seats_v1%rowtype;
 settings public.poker_timebank_prices_v1%rowtype;
 prior public.poker_timebank_receipts_v1%rowtype;
 amount numeric(12,8):=0;wallet_balance numeric;txn_id uuid;charged boolean:=false;
 new_deadline timestamptz;receipt jsonb;
BEGIN
 IF p_actor IS NULL OR p_request IS NULL OR p_currency IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST';END IF;
 SELECT * INTO t FROM public.poker_tables_v1 WHERE id=p_table FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND';END IF;
 SELECT * INTO prior FROM public.poker_timebank_receipts_v1 WHERE table_id=p_table AND request_id=p_request;
 IF FOUND THEN
   IF prior.user_id<>p_actor OR prior.currency<>p_currency THEN RAISE EXCEPTION 'REQUEST_ID_REUSED'; END IF;
   RETURN prior.result;
 END IF;
 IF t.status<>'playing' OR t.version<>p_version OR t.turn_deadline_at IS NULL
    OR t.turn_deadline_at<=clock_timestamp() OR t.turn_extension_used OR t.turn_started_at IS NULL
 THEN RAISE EXCEPTION 'TIMEBANK_NOT_AVAILABLE'; END IF;
 SELECT * INTO seat FROM public.poker_seats_v1 WHERE table_id=p_table AND seat_no=t.turn_index FOR UPDATE;
 IF NOT FOUND OR seat.user_id<>p_actor OR seat.folded OR seat.all_in THEN RAISE EXCEPTION 'NOT_YOUR_TURN';END IF;
 SELECT * INTO settings FROM public.poker_timebank_prices_v1 WHERE singleton=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'TIMEBANK_UNCONFIGURED'; END IF;

 IF p_currency='PRACTICE' THEN
  IF NOT settings.practice_preview_enabled THEN RAISE EXCEPTION 'PRACTICE_EXTENSION_DISABLED';END IF;
 ELSIF p_currency='IGD' THEN
  IF NOT settings.payment_enabled THEN RAISE EXCEPTION 'PAID_EXTENSION_DISABLED';END IF;
  amount=settings.igd_price;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_excluded IS FALSE) THEN
    RAISE EXCEPTION 'PLAYER_NOT_ELIGIBLE'; END IF;
  SELECT igd_balance INTO wallet_balance FROM public.wallets WHERE user_id=p_actor FOR UPDATE;
  IF wallet_balance IS NULL OR wallet_balance<amount THEN RAISE EXCEPTION 'INSUFFICIENT_IGD';END IF;
  UPDATE public.wallets SET igd_balance=igd_balance-amount WHERE user_id=p_actor;
  INSERT INTO public.transactions(user_id,type,currency,igd_amount,status,game_slug,description,balance_after,reference_id)
    VALUES(p_actor,'loss','IGD',-amount,'completed','poker-timebank','Poker turn +30 seconds',
     wallet_balance-amount,p_request::text) RETURNING id INTO txn_id;
  charged=true;
 ELSIF p_currency='IGN' THEN
  RAISE EXCEPTION 'IGN_RATE_AND_LEDGER_NOT_CONFIGURED';
 ELSE
  RAISE EXCEPTION 'UNSUPPORTED_TIMEBANK_CURRENCY';
 END IF;

 new_deadline=t.turn_deadline_at+interval '30 seconds';
 UPDATE public.poker_tables_v1
    SET turn_deadline_at=new_deadline,turn_extension_used=true,version=version+1,last_action_at=clock_timestamp()
  WHERE id=p_table;
 receipt=jsonb_build_object('tableId',p_table,'version',t.version+1,'deadline',new_deadline,
   'extensionSeconds',30,'currency',p_currency,'charged',charged,'amount',amount,'requestId',p_request);
 INSERT INTO public.poker_timebank_receipts_v1(
    table_id,request_id,user_id,hand_no,turn_started_at,currency,amount,wallet_transaction_id,new_deadline_at,result)
 VALUES(p_table,p_request,p_actor,t.hand_no,t.turn_started_at,p_currency,amount,txn_id,new_deadline,receipt);
 RETURN receipt;
END $$;

REVOKE ALL ON FUNCTION public.poker_action_v3(uuid,uuid,uuid,bigint,text,bigint,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_timeout_turn_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_buy_time_v1(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.poker_action_v3(uuid,uuid,uuid,bigint,text,bigint,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_timeout_turn_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_buy_time_v1(uuid,uuid,uuid,bigint,text) TO service_role;
-- Do not leave an ungated non-timed action endpoint callable by the service client.
REVOKE ALL ON FUNCTION public.poker_action_v1(uuid,uuid,uuid,bigint,text,bigint) FROM service_role;
,'end; $function
   OR position('TURN_DEADLINE_EXPIRED' in definition)=0 OR
   position('turn_deadline_at=clock_timestamp()+' in definition)=0
 THEN RAISE EXCEPTION 'ACTION_DEADLINE_PATCH_FAILED'; END IF;
 EXECUTE definition;
END $$;

CREATE OR REPLACE FUNCTION public.poker_timeout_turn_v1(p_table uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.poker_tables_v1%rowtype;seat public.poker_seats_v1%rowtype;forced text;res jsonb;
BEGIN
 SELECT * INTO t FROM public.poker_tables_v1 WHERE id=p_table FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND';END IF;
 IF t.status<>'playing' OR t.turn_index IS NULL THEN
   RETURN jsonb_build_object('timedOut',false,'tableId',p_table,'version',t.version,'status',t.status);
 END IF;
 IF t.turn_deadline_at IS NULL THEN RAISE EXCEPTION 'ACTIVE_TURN_DEADLINE_MISSING'; END IF;
 IF clock_timestamp()<t.turn_deadline_at THEN
   RETURN jsonb_build_object('timedOut',false,'tableId',p_table,'version',t.version,'deadline',t.turn_deadline_at);
 END IF;
 SELECT * INTO seat FROM public.poker_seats_v1 WHERE table_id=p_table AND seat_no=t.turn_index FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_SEAT_MISSING'; END IF;
 forced=CASE WHEN seat.street_bet>=t.current_bet THEN 'check' ELSE 'fold' END;
 res=public.poker_action_v3(p_table,seat.user_id,gen_random_uuid(),t.version,forced,0,true);
 RETURN res||jsonb_build_object('timedOut',true,'autoAction',forced);
END $$;

CREATE OR REPLACE FUNCTION public.poker_buy_time_v1(
 p_table uuid,p_actor uuid,p_request uuid,p_version bigint,p_currency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.poker_tables_v1%rowtype;seat public.poker_seats_v1%rowtype;
 settings public.poker_timebank_prices_v1%rowtype;
 prior public.poker_timebank_receipts_v1%rowtype;
 amount numeric(12,8):=0;wallet_balance numeric;txn_id uuid;charged boolean:=false;
 new_deadline timestamptz;receipt jsonb;
BEGIN
 IF p_actor IS NULL OR p_request IS NULL OR p_currency IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST';END IF;
 SELECT * INTO t FROM public.poker_tables_v1 WHERE id=p_table FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND';END IF;
 SELECT * INTO prior FROM public.poker_timebank_receipts_v1 WHERE table_id=p_table AND request_id=p_request;
 IF FOUND THEN
   IF prior.user_id<>p_actor OR prior.currency<>p_currency THEN RAISE EXCEPTION 'REQUEST_ID_REUSED'; END IF;
   RETURN prior.result;
 END IF;
 IF t.status<>'playing' OR t.version<>p_version OR t.turn_deadline_at IS NULL
    OR t.turn_deadline_at<=clock_timestamp() OR t.turn_extension_used OR t.turn_started_at IS NULL
 THEN RAISE EXCEPTION 'TIMEBANK_NOT_AVAILABLE'; END IF;
 SELECT * INTO seat FROM public.poker_seats_v1 WHERE table_id=p_table AND seat_no=t.turn_index FOR UPDATE;
 IF NOT FOUND OR seat.user_id<>p_actor OR seat.folded OR seat.all_in THEN RAISE EXCEPTION 'NOT_YOUR_TURN';END IF;
 SELECT * INTO settings FROM public.poker_timebank_prices_v1 WHERE singleton=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'TIMEBANK_UNCONFIGURED'; END IF;

 IF p_currency='PRACTICE' THEN
  IF NOT settings.practice_preview_enabled THEN RAISE EXCEPTION 'PRACTICE_EXTENSION_DISABLED';END IF;
 ELSIF p_currency='IGD' THEN
  IF NOT settings.payment_enabled THEN RAISE EXCEPTION 'PAID_EXTENSION_DISABLED';END IF;
  amount=settings.igd_price;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_excluded IS FALSE) THEN
    RAISE EXCEPTION 'PLAYER_NOT_ELIGIBLE'; END IF;
  SELECT igd_balance INTO wallet_balance FROM public.wallets WHERE user_id=p_actor FOR UPDATE;
  IF wallet_balance IS NULL OR wallet_balance<amount THEN RAISE EXCEPTION 'INSUFFICIENT_IGD';END IF;
  UPDATE public.wallets SET igd_balance=igd_balance-amount WHERE user_id=p_actor;
  INSERT INTO public.transactions(user_id,type,currency,igd_amount,status,game_slug,description,balance_after,reference_id)
    VALUES(p_actor,'loss','IGD',-amount,'completed','poker-timebank','Poker turn +30 seconds',
     wallet_balance-amount,p_request::text) RETURNING id INTO txn_id;
  charged=true;
 ELSIF p_currency='IGN' THEN
  RAISE EXCEPTION 'IGN_RATE_AND_LEDGER_NOT_CONFIGURED';
 ELSE
  RAISE EXCEPTION 'UNSUPPORTED_TIMEBANK_CURRENCY';
 END IF;

 new_deadline=t.turn_deadline_at+interval '30 seconds';
 UPDATE public.poker_tables_v1
    SET turn_deadline_at=new_deadline,turn_extension_used=true,version=version+1,last_action_at=clock_timestamp()
  WHERE id=p_table;
 receipt=jsonb_build_object('tableId',p_table,'version',t.version+1,'deadline',new_deadline,
   'extensionSeconds',30,'currency',p_currency,'charged',charged,'amount',amount,'requestId',p_request);
 INSERT INTO public.poker_timebank_receipts_v1(
    table_id,request_id,user_id,hand_no,turn_started_at,currency,amount,wallet_transaction_id,new_deadline_at,result)
 VALUES(p_table,p_request,p_actor,t.hand_no,t.turn_started_at,p_currency,amount,txn_id,new_deadline,receipt);
 RETURN receipt;
END $$;

REVOKE ALL ON FUNCTION public.poker_action_v3(uuid,uuid,uuid,bigint,text,bigint,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_timeout_turn_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_buy_time_v1(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.poker_action_v3(uuid,uuid,uuid,bigint,text,bigint,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_timeout_turn_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_buy_time_v1(uuid,uuid,uuid,bigint,text) TO service_role;
-- Do not leave an ungated non-timed action endpoint callable by the service client.
REVOKE ALL ON FUNCTION public.poker_action_v1(uuid,uuid,uuid,bigint,text,bigint) FROM service_role;
);
 IF definition=original OR position('p_system_timeout boolean' in definition)=0
   OR position('TURN_DEADLINE_EXPIRED' in definition)=0 OR
   position('turn_deadline_at=clock_timestamp()+' in definition)=0
 THEN RAISE EXCEPTION 'ACTION_DEADLINE_PATCH_FAILED'; END IF;
 EXECUTE definition;
END $$;

CREATE OR REPLACE FUNCTION public.poker_timeout_turn_v1(p_table uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.poker_tables_v1%rowtype;seat public.poker_seats_v1%rowtype;forced text;res jsonb;
BEGIN
 SELECT * INTO t FROM public.poker_tables_v1 WHERE id=p_table FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND';END IF;
 IF t.status<>'playing' OR t.turn_index IS NULL THEN
   RETURN jsonb_build_object('timedOut',false,'tableId',p_table,'version',t.version,'status',t.status);
 END IF;
 IF t.turn_deadline_at IS NULL THEN RAISE EXCEPTION 'ACTIVE_TURN_DEADLINE_MISSING'; END IF;
 IF clock_timestamp()<t.turn_deadline_at THEN
   RETURN jsonb_build_object('timedOut',false,'tableId',p_table,'version',t.version,'deadline',t.turn_deadline_at);
 END IF;
 SELECT * INTO seat FROM public.poker_seats_v1 WHERE table_id=p_table AND seat_no=t.turn_index FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_SEAT_MISSING'; END IF;
 forced=CASE WHEN seat.street_bet>=t.current_bet THEN 'check' ELSE 'fold' END;
 res=public.poker_action_v3(p_table,seat.user_id,gen_random_uuid(),t.version,forced,0,true);
 RETURN res||jsonb_build_object('timedOut',true,'autoAction',forced);
END $$;

CREATE OR REPLACE FUNCTION public.poker_buy_time_v1(
 p_table uuid,p_actor uuid,p_request uuid,p_version bigint,p_currency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.poker_tables_v1%rowtype;seat public.poker_seats_v1%rowtype;
 settings public.poker_timebank_prices_v1%rowtype;
 prior public.poker_timebank_receipts_v1%rowtype;
 amount numeric(12,8):=0;wallet_balance numeric;txn_id uuid;charged boolean:=false;
 new_deadline timestamptz;receipt jsonb;
BEGIN
 IF p_actor IS NULL OR p_request IS NULL OR p_currency IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST';END IF;
 SELECT * INTO t FROM public.poker_tables_v1 WHERE id=p_table FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND';END IF;
 SELECT * INTO prior FROM public.poker_timebank_receipts_v1 WHERE table_id=p_table AND request_id=p_request;
 IF FOUND THEN
   IF prior.user_id<>p_actor OR prior.currency<>p_currency THEN RAISE EXCEPTION 'REQUEST_ID_REUSED'; END IF;
   RETURN prior.result;
 END IF;
 IF t.status<>'playing' OR t.version<>p_version OR t.turn_deadline_at IS NULL
    OR t.turn_deadline_at<=clock_timestamp() OR t.turn_extension_used OR t.turn_started_at IS NULL
 THEN RAISE EXCEPTION 'TIMEBANK_NOT_AVAILABLE'; END IF;
 SELECT * INTO seat FROM public.poker_seats_v1 WHERE table_id=p_table AND seat_no=t.turn_index FOR UPDATE;
 IF NOT FOUND OR seat.user_id<>p_actor OR seat.folded OR seat.all_in THEN RAISE EXCEPTION 'NOT_YOUR_TURN';END IF;
 SELECT * INTO settings FROM public.poker_timebank_prices_v1 WHERE singleton=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'TIMEBANK_UNCONFIGURED'; END IF;

 IF p_currency='PRACTICE' THEN
  IF NOT settings.practice_preview_enabled THEN RAISE EXCEPTION 'PRACTICE_EXTENSION_DISABLED';END IF;
 ELSIF p_currency='IGD' THEN
  IF NOT settings.payment_enabled THEN RAISE EXCEPTION 'PAID_EXTENSION_DISABLED';END IF;
  amount=settings.igd_price;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_excluded IS FALSE) THEN
    RAISE EXCEPTION 'PLAYER_NOT_ELIGIBLE'; END IF;
  SELECT igd_balance INTO wallet_balance FROM public.wallets WHERE user_id=p_actor FOR UPDATE;
  IF wallet_balance IS NULL OR wallet_balance<amount THEN RAISE EXCEPTION 'INSUFFICIENT_IGD';END IF;
  UPDATE public.wallets SET igd_balance=igd_balance-amount WHERE user_id=p_actor;
  INSERT INTO public.transactions(user_id,type,currency,igd_amount,status,game_slug,description,balance_after,reference_id)
    VALUES(p_actor,'loss','IGD',-amount,'completed','poker-timebank','Poker turn +30 seconds',
     wallet_balance-amount,p_request::text) RETURNING id INTO txn_id;
  charged=true;
 ELSIF p_currency='IGN' THEN
  RAISE EXCEPTION 'IGN_RATE_AND_LEDGER_NOT_CONFIGURED';
 ELSE
  RAISE EXCEPTION 'UNSUPPORTED_TIMEBANK_CURRENCY';
 END IF;

 new_deadline=t.turn_deadline_at+interval '30 seconds';
 UPDATE public.poker_tables_v1
    SET turn_deadline_at=new_deadline,turn_extension_used=true,version=version+1,last_action_at=clock_timestamp()
  WHERE id=p_table;
 receipt=jsonb_build_object('tableId',p_table,'version',t.version+1,'deadline',new_deadline,
   'extensionSeconds',30,'currency',p_currency,'charged',charged,'amount',amount,'requestId',p_request);
 INSERT INTO public.poker_timebank_receipts_v1(
    table_id,request_id,user_id,hand_no,turn_started_at,currency,amount,wallet_transaction_id,new_deadline_at,result)
 VALUES(p_table,p_request,p_actor,t.hand_no,t.turn_started_at,p_currency,amount,txn_id,new_deadline,receipt);
 RETURN receipt;
END $$;

REVOKE ALL ON FUNCTION public.poker_action_v3(uuid,uuid,uuid,bigint,text,bigint,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_timeout_turn_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_buy_time_v1(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.poker_action_v3(uuid,uuid,uuid,bigint,text,bigint,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_timeout_turn_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_buy_time_v1(uuid,uuid,uuid,bigint,text) TO service_role;
-- Do not leave an ungated non-timed action endpoint callable by the service client.
REVOKE ALL ON FUNCTION public.poker_action_v1(uuid,uuid,uuid,bigint,text,bigint) FROM service_role;
