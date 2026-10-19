-- Authoritative staging Poker rules/schema export, 2026-10-17.
-- Migration order: after 20261017090000_poker_tournament_drafts.sql.
-- Practice chips only: NO real-value wallet transfers or prize payouts.
-- SQL functions use security invoker, restricted to service_role.
CREATE TABLE IF NOT EXISTS public.poker_tables_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','playing','showdown','complete')),
 version bigint NOT NULL DEFAULT 0,
 button integer NOT NULL DEFAULT -1,
 turn_index integer,
 street text NOT NULL DEFAULT 'preflop',
 small_blind bigint NOT NULL DEFAULT 5,
 big_blind bigint NOT NULL DEFAULT 10,
 current_bet bigint NOT NULL DEFAULT 0,
 min_raise bigint NOT NULL DEFAULT 10,
 board jsonb NOT NULL DEFAULT '[]'::jsonb,
 deck_commitment text,
 private_deck jsonb,
 seed_secret text,
 last_action_at timestamptz DEFAULT now(),
 dealt_count integer NOT NULL DEFAULT 0,
 event_id uuid REFERENCES public.poker_events_v1(id),
 hand_no integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.poker_seats_v1 (
 table_id uuid NOT NULL REFERENCES public.poker_tables_v1(id) ON DELETE CASCADE,
 seat_no integer NOT NULL CHECK(seat_no BETWEEN 0 AND 9),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 stack bigint NOT NULL CHECK(stack>=0),
 committed bigint NOT NULL DEFAULT 0 CHECK(committed>=0),
 street_bet bigint NOT NULL DEFAULT 0 CHECK(street_bet>=0),
 folded boolean NOT NULL DEFAULT false,
 all_in boolean NOT NULL DEFAULT false,
 acted boolean NOT NULL DEFAULT false,
 private_hole jsonb NOT NULL DEFAULT '[]'::jsonb,
 PRIMARY KEY(table_id,seat_no),
 UNIQUE(table_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.poker_actions_v1 (
 table_id uuid NOT NULL REFERENCES public.poker_tables_v1(id) ON DELETE CASCADE,
 action_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 before_version bigint NOT NULL,
 after_version bigint NOT NULL,
 action text NOT NULL,
 chips bigint NOT NULL,
 result jsonb NOT NULL,
 PRIMARY KEY(table_id,action_id),
 UNIQUE(table_id,after_version)
);
CREATE TABLE IF NOT EXISTS public.poker_event_entries_v1 (
 event_id uuid NOT NULL REFERENCES public.poker_events_v1(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','seated','eliminated')),
 table_id uuid REFERENCES public.poker_tables_v1(id),
 seat_no integer CHECK(seat_no BETWEEN 0 AND 5),
 registered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,user_id),
 UNIQUE(table_id,seat_no)
);
CREATE INDEX IF NOT EXISTS poker_tables_event_idx ON public.poker_tables_v1(event_id);
CREATE INDEX IF NOT EXISTS poker_seats_user_idx ON public.poker_seats_v1(user_id);
CREATE INDEX IF NOT EXISTS poker_event_entries_user_idx ON public.poker_event_entries_v1(user_id);
ALTER TABLE public.poker_events_v1 ADD COLUMN IF NOT EXISTS current_level integer NOT NULL DEFAULT 1;
ALTER TABLE public.poker_events_v1 ADD COLUMN IF NOT EXISTS level_started_at timestamptz;
ALTER TABLE public.poker_tables_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_seats_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_actions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_event_entries_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.poker_tables_v1,public.poker_seats_v1,public.poker_actions_v1,public.poker_event_entries_v1 FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.poker_action_v1(p_table uuid, p_actor uuid, p_action_id uuid, p_version bigint, p_action text, p_amount bigint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.poker_tables_v1%rowtype;s public.poker_seats_v1%rowtype; old jsonb;due bigint;paid bigint:=0;target bigint;raise_by bigint;pending int;survivors int;next_seat int;v bigint;answer jsonb;
begin
 if p_actor is null or p_action_id is null or p_version<0 then raise exception 'INVALID_REQUEST';end if;
 select * into t from public.poker_tables_v1 where id=p_table for update;
 if not found then raise exception 'TABLE_NOT_FOUND';end if;
 select result into old from public.poker_actions_v1 where table_id=p_table and action_id=p_action_id;
 if found then return old;end if;
 if t.status<>'playing' or t.version<>p_version then raise exception 'INACTIVE_OR_STALE';end if;
 select * into s from public.poker_seats_v1 where table_id=p_table and seat_no=t.turn_index for update;
 if not found or s.user_id<>p_actor or s.folded or s.all_in then raise exception 'NOT_YOUR_TURN';end if;
 due=greatest(0,t.current_bet-s.street_bet);
 if p_action='fold' then update public.poker_seats_v1 set folded=true,acted=true where table_id=p_table and seat_no=s.seat_no;
 elsif p_action='check' then
  if due<>0 then raise exception 'CANNOT_CHECK';end if;
  update public.poker_seats_v1 set acted=true where table_id=p_table and seat_no=s.seat_no;
 elsif p_action in ('call','allin','raise','bet') then
  if p_action='call' then paid=least(due,s.stack);
  elsif p_action='allin' then
   paid=s.stack;
   if s.acted and s.street_bet+paid>t.current_bet then raise exception 'NOT_REOPENED';end if;
  else
   if s.acted or p_amount is null or p_amount<=t.current_bet then raise exception 'INVALID_RAISE';end if;
   if (p_action='bet' and t.current_bet<>0) or (p_action='raise' and t.current_bet=0) then raise exception 'INVALID_BET_TYPE';end if;
   paid=p_amount-s.street_bet;
   if paid>s.stack or p_amount-t.current_bet<t.min_raise then raise exception 'INVALID_RAISE';end if;
  end if;
  target=s.street_bet+paid;
  if target>t.current_bet then
   raise_by=target-t.current_bet;
   update public.poker_tables_v1 set current_bet=target where id=p_table;
   if raise_by>=t.min_raise then
    update public.poker_tables_v1 set min_raise=raise_by where id=p_table;
    update public.poker_seats_v1 set acted=false where table_id=p_table and seat_no<>s.seat_no and not folded and not all_in;
   end if;
  end if;
  update public.poker_seats_v1 set stack=stack-paid,committed=committed+paid,street_bet=street_bet+paid,all_in=(stack=paid),acted=true where table_id=p_table and seat_no=s.seat_no;
 else raise exception 'UNKNOWN_ACTION';end if;
 select count(*) into survivors from public.poker_seats_v1 where table_id=p_table and not folded;
 if survivors=1 then
  update public.poker_seats_v1 set stack=stack+(select sum(committed) from public.poker_seats_v1 where table_id=p_table) where table_id=p_table and not folded;
  update public.poker_seats_v1 set committed=0,street_bet=0 where table_id=p_table;
  update public.poker_tables_v1 set status='complete',turn_index=null where id=p_table;
 else
  select count(*) into pending from public.poker_seats_v1 x join public.poker_tables_v1 y on y.id=x.table_id where x.table_id=p_table and not x.folded and not x.all_in and (not x.acted or x.street_bet<y.current_bet);
  if pending>0 then
   select x.seat_no into next_seat from public.poker_seats_v1 x join public.poker_tables_v1 y on y.id=x.table_id where x.table_id=p_table and not x.folded and not x.all_in and (not x.acted or x.street_bet<y.current_bet) order by (x.seat_no-s.seat_no+10)%10 limit 1;
   update public.poker_tables_v1 set turn_index=next_seat where id=p_table;
  else
   update public.poker_tables_v1 set status='showdown',turn_index=null where id=p_table;
  end if;
 end if;
 update public.poker_tables_v1 set version=version+1,last_action_at=now() where id=p_table returning version into v;
 answer=jsonb_build_object('tableId',p_table,'version',v,'accepted',true,'chipsCommitted',paid);
 insert into public.poker_actions_v1 values(p_table,p_action_id,p_actor,p_version,v,p_action,paid,answer);
 return answer;
end $function$;

CREATE OR REPLACE FUNCTION public.poker_advance_v1(p_table uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.poker_tables_v1%rowtype; actor int;firstseat int;active_count int;offset_card int;
begin
 select * into t from public.poker_tables_v1 where id=p_table for update;
 if not found or t.status<>'showdown' or t.street='river' then raise exception 'NOT_ADVANCEABLE';end if;
 select count(*) into active_count from public.poker_seats_v1 where table_id=p_table and not folded;
 if active_count<2 then raise exception 'HAND_ALREADY_WON';end if;
 if t.street='preflop' then
  update public.poker_tables_v1 set street='flop',board=jsonb_build_array(t.private_deck->(2*t.dealt_count+1),t.private_deck->(2*t.dealt_count+2),t.private_deck->(2*t.dealt_count+3)) where id=p_table;
 elsif t.street='flop' then
  update public.poker_tables_v1 set street='turn',board=board||jsonb_build_array(t.private_deck->(2*t.dealt_count+5)) where id=p_table;
 else
  update public.poker_tables_v1 set street='river',board=board||jsonb_build_array(t.private_deck->(2*t.dealt_count+7)) where id=p_table;
 end if;
 update public.poker_seats_v1 set street_bet=0,acted=false where table_id=p_table;
 select seat_no into actor from public.poker_seats_v1 where table_id=p_table and not folded and not all_in order by (seat_no-t.button-1+6)%6 limit 1;
 update public.poker_tables_v1 set status=case when actor is null then 'showdown' else 'playing' end,turn_index=actor,current_bet=0,min_raise=big_blind,version=version+1 where id=p_table;
 return jsonb_build_object('tableId',p_table,'version',t.version+1,'street',(select street from public.poker_tables_v1 where id=p_table));
end $function$;

CREATE OR REPLACE FUNCTION public.poker_capture_dealt_count_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.status='waiting' and new.status='playing' then
  select count(*) into new.dealt_count from public.poker_seats_v1 where table_id=new.id and not folded;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.poker_create_v1(p_owner uuid, p_stack bigint DEFAULT 1000)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare tid uuid;
begin
 if p_owner is null or p_stack<>1000 then raise exception 'INVALID_FREEPLAY_STACK';end if;
 insert into public.poker_tables_v1(owner_id) values(p_owner) returning id into tid;
 insert into public.poker_seats_v1(table_id,seat_no,user_id,stack) values(tid,0,p_owner,p_stack);
 return tid;
end $function$;

CREATE OR REPLACE FUNCTION public.poker_event_publish_v1(p_event uuid, p_actor uuid, p_version bigint, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE e public.poker_events_v1%rowtype;existing record;result jsonb;
BEGIN
 SELECT * INTO e FROM public.poker_events_v1 WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR e.created_by<>p_actor THEN RAISE EXCEPTION 'EVENT_NOT_FOUND_OR_FORBIDDEN';END IF;
 SELECT operation,after_version INTO existing FROM public.poker_event_audit_v1 WHERE request_id=p_request AND event_id=p_event;
 IF FOUND THEN RETURN jsonb_build_object('eventId',p_event,'version',existing.after_version,'status','registration');END IF;
 IF e.status<>'draft' OR e.version<>p_version THEN RAISE EXCEPTION 'EVENT_STALE_OR_NOT_DRAFT';END IF;
 UPDATE public.poker_events_v1 SET status='registration',version=version+1,updated_at=now() WHERE id=p_event;
 INSERT INTO public.poker_event_audit_v1(event_id,actor_id,operation,request_id,before_version,after_version)
 VALUES(p_event,p_actor,'publish',p_request,e.version,e.version+1);
 RETURN jsonb_build_object('eventId',p_event,'version',e.version+1,'status','registration');
END $function$;

CREATE OR REPLACE FUNCTION public.poker_event_register_v1(p_event uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE e public.poker_events_v1%rowtype;registered int;max_players int;
BEGIN
 SELECT * INTO e FROM public.poker_events_v1 WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR e.status<>'registration' THEN RAISE EXCEPTION 'REGISTRATION_CLOSED';END IF;
 IF EXISTS(SELECT 1 FROM public.poker_event_entries_v1 WHERE event_id=p_event AND user_id=p_actor) THEN
   RETURN jsonb_build_object('eventId',p_event,'registered',true,'alreadyRegistered',true);
 END IF;
 max_players=(e.config->>'maxPlayers')::int;
 SELECT count(*) INTO registered FROM public.poker_event_entries_v1 WHERE event_id=p_event;
 IF registered>=max_players THEN RAISE EXCEPTION 'EVENT_FULL';END IF;
 INSERT INTO public.poker_event_entries_v1(event_id,user_id) VALUES(p_event,p_actor);
 RETURN jsonb_build_object('eventId',p_event,'registered',true,'count',registered+1,'capacity',max_players);
END $function$;

CREATE OR REPLACE FUNCTION public.poker_event_start_v1(p_event uuid, p_actor uuid, p_version bigint, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE e public.poker_events_v1%rowtype;registered int;capacity int;max_seats int;table_count int;idx int:=0;table_index int;seat_idx int;tid uuid;owner uuid;participant record;level0 jsonb;existing record;
BEGIN
 SELECT * INTO e FROM public.poker_events_v1 WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR e.created_by<>p_actor THEN RAISE EXCEPTION 'EVENT_NOT_FOUND_OR_FORBIDDEN';END IF;
 SELECT operation,after_version INTO existing FROM public.poker_event_audit_v1 WHERE request_id=p_request AND event_id=p_event;
 IF FOUND THEN RETURN jsonb_build_object('eventId',p_event,'status','running','version',existing.after_version);END IF;
 IF e.status<>'registration' OR e.version<>p_version THEN RAISE EXCEPTION 'EVENT_STALE_OR_NOT_OPEN';END IF;
 SELECT count(*) INTO registered FROM public.poker_event_entries_v1 WHERE event_id=p_event;
 capacity=(e.config->>'maxPlayers')::int;max_seats=least(6,(e.config->>'seatsPerTable')::int);
 IF registered<2 OR (e.format='sit_and_go' AND registered<>capacity) THEN RAISE EXCEPTION 'NOT_ENOUGH_REGISTRATIONS';END IF;
 IF e.format='scheduled_mtt' AND now()<(e.config->>'startAt')::timestamptz THEN RAISE EXCEPTION 'START_TIME_NOT_REACHED';END IF;
 IF max_seats<2 OR max_seats>6 OR registered>capacity THEN RAISE EXCEPTION 'BAD_SEAT_CONFIGURATION';END IF;
 table_count=ceil(registered::numeric/max_seats)::int;
 IF registered<table_count*2 THEN RAISE EXCEPTION 'TABLE_NEEDS_TWO_PLAYERS';END IF;
 level0=e.config->'levels'->0;
 FOR table_index IN 0..table_count-1 LOOP
   SELECT user_id INTO owner FROM public.poker_event_entries_v1 WHERE event_id=p_event ORDER BY registered_at,user_id OFFSET table_index LIMIT 1;
   INSERT INTO public.poker_tables_v1(owner_id,event_id,small_blind,big_blind,min_raise)
   VALUES(owner,p_event,(level0->>'smallBlind')::bigint,(level0->>'bigBlind')::bigint,(level0->>'bigBlind')::bigint)
   RETURNING id INTO tid;
   -- Deal registrations round-robin, keeping each table >=2 when possible.
   seat_idx=0;
   FOR participant IN SELECT user_id,(row_number() over (order by registered_at,user_id)-1)::int AS position FROM public.poker_event_entries_v1 WHERE event_id=p_event LOOP
      -- Using stable registration position to allocate seats.
      IF (participant.position%table_count)=table_index THEN
        INSERT INTO public.poker_seats_v1(table_id,seat_no,user_id,stack)
        VALUES(tid,seat_idx,participant.user_id,(e.config->>'startingStack')::bigint);
        UPDATE public.poker_event_entries_v1 SET table_id=tid,seat_no=seat_idx,status='seated' WHERE event_id=p_event AND user_id=participant.user_id;
        seat_idx=seat_idx+1;
      END IF;
   END LOOP;
 END LOOP;
 UPDATE public.poker_events_v1 SET status='running',level_started_at=now(),current_level=1,version=version+1,updated_at=now() WHERE id=p_event;
 INSERT INTO public.poker_event_audit_v1(event_id,actor_id,operation,request_id,before_version,after_version,details)
 VALUES(p_event,p_actor,'start',p_request,e.version,e.version+1,jsonb_build_object('tables',table_count,'players',registered));
 RETURN jsonb_build_object('eventId',p_event,'status','running','version',e.version+1,'tables',table_count,'players',registered);
END $function$;

CREATE OR REPLACE FUNCTION public.poker_event_sync_v1(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE e public.poker_events_v1%rowtype;alive int;tid uuid;from_table uuid;to_table uuid;player record;new_seat int;max_count int;min_count int;move_count int:=0;total_chips numeric;expected_chips numeric;champion uuid;old_version bigint;
BEGIN
 SELECT * INTO e FROM public.poker_events_v1 WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR e.status<>'running' THEN RAISE EXCEPTION 'EVENT_NOT_RUNNING';END IF;
 IF e.format='ring' THEN RETURN jsonb_build_object('eventId',p_event,'ring',true,'moved',0);END IF;
 PERFORM t.id FROM public.poker_tables_v1 t WHERE t.event_id=p_event ORDER BY t.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.poker_tables_v1 WHERE event_id=p_event AND status IN ('playing','showdown')) THEN
  RETURN jsonb_build_object('eventId',p_event,'pendingHands',true);
 END IF;
 -- Busted tournament seats have zero chips and no active hand; release seats between hands.
 UPDATE public.poker_event_entries_v1 x SET status='eliminated',table_id=null,seat_no=null
 WHERE x.event_id=p_event AND EXISTS(SELECT 1 FROM public.poker_seats_v1 s WHERE s.table_id=x.table_id AND s.user_id=x.user_id AND s.stack=0 AND s.committed=0);
 DELETE FROM public.poker_seats_v1 s USING public.poker_tables_v1 t
 WHERE s.table_id=t.id AND t.event_id=p_event AND s.stack=0 AND s.committed=0;
 SELECT count(*) INTO alive FROM public.poker_seats_v1 s JOIN public.poker_tables_v1 t ON t.id=s.table_id WHERE t.event_id=p_event AND s.stack>0;
 IF alive>1 THEN
  IF alive<=6 THEN
   SELECT t.id INTO tid FROM public.poker_tables_v1 t LEFT JOIN public.poker_seats_v1 s ON s.table_id=t.id AND s.stack>0
    WHERE t.event_id=p_event GROUP BY t.id ORDER BY count(s.user_id) DESC,t.id LIMIT 1;
   FOR player IN SELECT s.table_id,s.user_id,s.stack FROM public.poker_seats_v1 s
     JOIN public.poker_tables_v1 t ON t.id=s.table_id WHERE t.event_id=p_event AND s.stack>0 AND s.table_id<>tid ORDER BY s.table_id,s.seat_no LOOP
    SELECT i INTO new_seat FROM generate_series(0,5)i WHERE NOT EXISTS(SELECT 1 FROM public.poker_seats_v1 WHERE table_id=tid AND seat_no=i) ORDER BY i LIMIT 1;
    IF new_seat IS NULL THEN RAISE EXCEPTION 'TARGET_TABLE_FULL';END IF;
    INSERT INTO public.poker_seats_v1(table_id,seat_no,user_id,stack) VALUES(tid,new_seat,player.user_id,player.stack);
    DELETE FROM public.poker_seats_v1 WHERE table_id=player.table_id AND user_id=player.user_id;
    UPDATE public.poker_event_entries_v1 SET table_id=tid,seat_no=new_seat WHERE event_id=p_event AND user_id=player.user_id;
    move_count=move_count+1;
   END LOOP;
  ELSE
   -- Keep multi-table field within one player per table, only between hands.
   FOR move_count IN 0..1000 LOOP
    SELECT t.id,count(s.user_id) INTO from_table,max_count FROM public.poker_tables_v1 t
      LEFT JOIN public.poker_seats_v1 s ON s.table_id=t.id AND s.stack>0
      WHERE t.event_id=p_event GROUP BY t.id ORDER BY count(s.user_id) DESC,t.id LIMIT 1;
    SELECT t.id,count(s.user_id) INTO to_table,min_count FROM public.poker_tables_v1 t
      LEFT JOIN public.poker_seats_v1 s ON s.table_id=t.id AND s.stack>0
      WHERE t.event_id=p_event GROUP BY t.id ORDER BY count(s.user_id),t.id LIMIT 1;
    EXIT WHEN max_count-min_count<=1;
    SELECT s.user_id,s.stack INTO player FROM public.poker_seats_v1 s WHERE s.table_id=from_table AND s.stack>0 ORDER BY s.seat_no DESC LIMIT 1;
    SELECT i INTO new_seat FROM generate_series(0,5)i WHERE NOT EXISTS(SELECT 1 FROM public.poker_seats_v1 WHERE table_id=to_table AND seat_no=i) ORDER BY i LIMIT 1;
    IF new_seat IS NULL THEN RAISE EXCEPTION 'NO_BALANCE_SEAT';END IF;
    INSERT INTO public.poker_seats_v1(table_id,seat_no,user_id,stack) VALUES(to_table,new_seat,player.user_id,player.stack);
    DELETE FROM public.poker_seats_v1 WHERE table_id=from_table AND user_id=player.user_id;
    UPDATE public.poker_event_entries_v1 SET table_id=to_table,seat_no=new_seat WHERE event_id=p_event AND user_id=player.user_id;
   END LOOP;
  END IF;
 END IF;
 -- A table owner eliminated or moved between hands cannot keep sole authority to start.
 UPDATE public.poker_tables_v1 t SET owner_id=(SELECT s.user_id FROM public.poker_seats_v1 s WHERE s.table_id=t.id AND s.stack>0 ORDER BY s.seat_no LIMIT 1)
 WHERE t.event_id=p_event AND EXISTS(SELECT 1 FROM public.poker_seats_v1 s WHERE s.table_id=t.id AND s.stack>0);
 SELECT coalesce(sum(s.stack+s.committed),0) INTO total_chips FROM public.poker_seats_v1 s JOIN public.poker_tables_v1 t ON t.id=s.table_id WHERE t.event_id=p_event;
 SELECT count(*)*(e.config->>'startingStack')::bigint INTO expected_chips FROM public.poker_event_entries_v1 WHERE event_id=p_event;
 IF total_chips<>expected_chips THEN RAISE EXCEPTION 'TOURNAMENT_CHIP_CONSERVATION_FAILED: % versus %',total_chips,expected_chips;END IF;
 IF alive=1 THEN
   SELECT s.user_id INTO champion FROM public.poker_seats_v1 s JOIN public.poker_tables_v1 t ON t.id=s.table_id WHERE t.event_id=p_event AND s.stack>0;
   old_version=e.version;
   UPDATE public.poker_events_v1 SET status='finished',version=version+1,updated_at=now() WHERE id=p_event;
   INSERT INTO public.poker_event_audit_v1(event_id,actor_id,operation,request_id,before_version,after_version,details)
   VALUES(p_event,e.created_by,'system_finish',gen_random_uuid(),old_version,old_version+1,jsonb_build_object('winner',champion,'chips',total_chips));
 END IF;
 RETURN jsonb_build_object('eventId',p_event,'remaining',alive,'finished',alive=1,'moved',move_count,'chips',total_chips);
END $function$;

CREATE OR REPLACE FUNCTION public.poker_event_tick_v1(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE e public.poker_events_v1%rowtype;num_levels int;level_no int;level_data jsonb;started timestamptz;duration int;changed boolean:=false;
BEGIN
 SELECT * INTO e FROM public.poker_events_v1 WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR e.status<>'running' THEN RAISE EXCEPTION 'EVENT_NOT_RUNNING';END IF;
 IF e.format='ring' THEN RETURN jsonb_build_object('eventId',p_event,'level',1,'ring',true);END IF;
 num_levels=jsonb_array_length(e.config->'levels');
 level_no=e.current_level;started=e.level_started_at;
 IF started IS NULL OR num_levels<1 THEN RAISE EXCEPTION 'INVALID_LEVEL_CLOCK';END IF;
 WHILE level_no<num_levels LOOP
   level_data=e.config->'levels'->(level_no-1);
   duration=(level_data->>'durationSeconds')::int;
   EXIT WHEN started+make_interval(secs=>duration)>clock_timestamp();
   started=started+make_interval(secs=>duration);
   level_no=level_no+1;changed=true;
 END LOOP;
 IF changed THEN
   level_data=e.config->'levels'->(level_no-1);
   UPDATE public.poker_events_v1 SET current_level=level_no,level_started_at=started,version=version+1,updated_at=clock_timestamp() WHERE id=p_event;
 END IF;
 level_data=e.config->'levels'->(level_no-1);
 UPDATE public.poker_tables_v1 SET small_blind=(level_data->>'smallBlind')::bigint,big_blind=(level_data->>'bigBlind')::bigint,
 min_raise=(level_data->>'bigBlind')::bigint
 WHERE event_id=p_event AND status IN ('waiting','complete') AND (small_blind IS DISTINCT FROM (level_data->>'smallBlind')::bigint OR big_blind IS DISTINCT FROM (level_data->>'bigBlind')::bigint);
 RETURN jsonb_build_object('eventId',p_event,'level',level_no,'changed',changed);
END $function$;

CREATE OR REPLACE FUNCTION public.poker_join_v1(p_table uuid, p_actor uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.poker_tables_v1%rowtype;seat int;
begin
 select * into t from public.poker_tables_v1 where id=p_table for update;
 if not found or t.status<>'waiting' then raise exception 'JOIN_CLOSED';end if;
 select seat_no into seat from public.poker_seats_v1 where table_id=p_table and user_id=p_actor;
 if found then return seat;end if;
 select i into seat from generate_series(0,5) i where not exists(select 1 from public.poker_seats_v1 where table_id=p_table and seat_no=i) order by i limit 1;
 if seat is null then raise exception 'TABLE_FULL';end if;
 insert into public.poker_seats_v1(table_id,seat_no,user_id,stack) values(p_table,seat,p_actor,1000);
 return seat;
end $function$;

CREATE OR REPLACE FUNCTION public.poker_settle_v1(p_table uuid, p_version bigint, p_awards jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.poker_tables_v1%rowtype;pot bigint;awarded bigint;award record;seat_count int;alive int;
begin
 select * into t from public.poker_tables_v1 where id=p_table for update;
 if not found or t.status<>'showdown' or t.street<>'river' or t.version<>p_version then raise exception 'NOT_SETTLEABLE';end if;
 select coalesce(sum(committed),0) into pot from public.poker_seats_v1 where table_id=p_table;
 select coalesce(sum((a.value->>'chips')::bigint),0) into awarded from jsonb_array_elements(p_awards) a;
 if jsonb_typeof(p_awards)<>'array' or awarded<>pot then raise exception 'INVALID_POT_AWARDS';end if;
 for award in select (a.value->>'seat')::int seat,(a.value->>'chips')::bigint chips from jsonb_array_elements(p_awards) a loop
  if award.chips<0 or not exists(select 1 from public.poker_seats_v1 where table_id=p_table and seat_no=award.seat and not folded) then raise exception 'INVALID_WINNER';end if;
  update public.poker_seats_v1 set stack=stack+award.chips where table_id=p_table and seat_no=award.seat;
 end loop;
 update public.poker_seats_v1 set committed=0,street_bet=0 where table_id=p_table;
 update public.poker_tables_v1 set status='complete',turn_index=null,version=version+1 where id=p_table;
 return jsonb_build_object('tableId',p_table,'version',p_version+1,'settled',true,'pot',pot);
end $function$;

CREATE OR REPLACE FUNCTION public.poker_start_v1(p_table uuid, p_owner uuid, p_deck jsonb, p_commitment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.poker_tables_v1%rowtype;players int;button_no int;sb int;bb int;actor int;idx int:=0;entry record;
begin
 select * into t from public.poker_tables_v1 where id=p_table for update;
 if not found or t.owner_id<>p_owner or t.status<>'waiting' then raise exception 'START_DENIED';end if;
 select count(*) into players from public.poker_seats_v1 where table_id=p_table and stack>0;
 if players<2 or players>6 then raise exception 'INVALID_PLAYER_COUNT';end if;
 if jsonb_typeof(p_deck)<>'array' or jsonb_array_length(p_deck)<>52 or p_commitment !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_DECK';end if;
 if (select count(distinct x.value::text) from jsonb_array_elements(p_deck) x)<>52 then raise exception 'DUPLICATE_CARDS';end if;
 -- Reset the previous hand state and rotate button, skipping broke seats.
 update public.poker_seats_v1 set committed=0,street_bet=0,folded=(stack=0),all_in=false,acted=false,private_hole='[]'::jsonb where table_id=p_table;
 select seat_no into button_no from public.poker_seats_v1 where table_id=p_table and stack>0 order by (seat_no-t.button+6)%6 limit 1;
 if t.button<0 then select min(seat_no) into button_no from public.poker_seats_v1 where table_id=p_table and stack>0;end if;
 for entry in select seat_no from public.poker_seats_v1 where table_id=p_table and stack>0 order by (seat_no-button_no+6)%6 loop
  update public.poker_seats_v1 set private_hole=jsonb_build_array(p_deck->idx,p_deck->(idx+players)) where table_id=p_table and seat_no=entry.seat_no;
  idx:=idx+1;
 end loop;
 if players=2 then sb=button_no;
 else select seat_no into sb from public.poker_seats_v1 where table_id=p_table and stack>0 and seat_no<>button_no order by (seat_no-button_no+6)%6 limit 1;end if;
 select seat_no into bb from public.poker_seats_v1 where table_id=p_table and stack>0 and seat_no<>sb order by (seat_no-sb+6)%6 limit 1;
 update public.poker_seats_v1 set stack=stack-least(stack,t.small_blind),committed=least(stack,t.small_blind),street_bet=least(stack,t.small_blind),all_in=(stack<=t.small_blind) where table_id=p_table and seat_no=sb;
 update public.poker_seats_v1 set stack=stack-least(stack,t.big_blind),committed=least(stack,t.big_blind),street_bet=least(stack,t.big_blind),all_in=(stack<=t.big_blind) where table_id=p_table and seat_no=bb;
 select seat_no into actor from public.poker_seats_v1 where table_id=p_table and stack>0 and seat_no<>bb order by (seat_no-bb+6)%6 limit 1;
 update public.poker_tables_v1 set status='playing',version=version+1,button=button_no,turn_index=actor,street='preflop',current_bet=t.big_blind,min_raise=t.big_blind,private_deck=p_deck,deck_commitment=p_commitment,board='[]'::jsonb,last_action_at=now() where id=p_table;
 return jsonb_build_object('tableId',p_table,'button',button_no,'smallBlind',sb,'bigBlind',bb,'version',t.version+1);
end $function$;

CREATE OR REPLACE FUNCTION public.poker_start_v2(p_table uuid, p_owner uuid, p_deck jsonb, p_commitment text, p_seed text, p_hand_no integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.poker_tables_v1%rowtype;players int;button_no int;sb int;bb int;actor int;idx int:=0;entry record;
begin
 select * into t from public.poker_tables_v1 where id=p_table for update;
 if not found or t.owner_id<>p_owner or t.status NOT IN ('waiting','complete') OR p_hand_no<>t.hand_no+1 OR coalesce(length(p_seed),0)<16 OR p_commitment<>encode(extensions.digest(p_seed||':'||p_table::text||':'||p_hand_no::text,'sha256'),'hex') then raise exception 'START_DENIED';end if;
 select count(*) into players from public.poker_seats_v1 where table_id=p_table and stack>0;
 if players<2 or players>6 then raise exception 'INVALID_PLAYER_COUNT';end if;
 if jsonb_typeof(p_deck)<>'array' or jsonb_array_length(p_deck)<>52 or p_commitment !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_DECK';end if;
 if (select count(distinct x.value::text) from jsonb_array_elements(p_deck) x)<>52 then raise exception 'DUPLICATE_CARDS';end if;
 -- Reset the previous hand state and rotate button, skipping broke seats.
 update public.poker_seats_v1 set committed=0,street_bet=0,folded=(stack=0),all_in=false,acted=false,private_hole='[]'::jsonb where table_id=p_table;
 select seat_no into button_no from public.poker_seats_v1 where table_id=p_table and stack>0 order by (seat_no-t.button-1+6)%6 limit 1;
 if t.button<0 then select min(seat_no) into button_no from public.poker_seats_v1 where table_id=p_table and stack>0;end if;
 for entry in select seat_no from public.poker_seats_v1 where table_id=p_table and stack>0 order by (seat_no-button_no+6)%6 loop
  update public.poker_seats_v1 set private_hole=jsonb_build_array(p_deck->idx,p_deck->(idx+players)) where table_id=p_table and seat_no=entry.seat_no;
  idx:=idx+1;
 end loop;
 if players=2 then sb=button_no;
 else select seat_no into sb from public.poker_seats_v1 where table_id=p_table and stack>0 and seat_no<>button_no order by (seat_no-button_no+6)%6 limit 1;end if;
 select seat_no into bb from public.poker_seats_v1 where table_id=p_table and stack>0 and seat_no<>sb order by (seat_no-sb+6)%6 limit 1;
 update public.poker_seats_v1 set stack=stack-least(stack,t.small_blind),committed=least(stack,t.small_blind),street_bet=least(stack,t.small_blind),all_in=(stack<=t.small_blind) where table_id=p_table and seat_no=sb;
 update public.poker_seats_v1 set stack=stack-least(stack,t.big_blind),committed=least(stack,t.big_blind),street_bet=least(stack,t.big_blind),all_in=(stack<=t.big_blind) where table_id=p_table and seat_no=bb;
 select seat_no into actor from public.poker_seats_v1 where table_id=p_table and stack>0 and seat_no<>bb order by (seat_no-bb+6)%6 limit 1;
 update public.poker_tables_v1 set status='playing',version=version+1,button=button_no,turn_index=actor,street='preflop',current_bet=t.big_blind,min_raise=t.big_blind,private_deck=p_deck,deck_commitment=p_commitment,seed_secret=p_seed,hand_no=p_hand_no,board='[]'::jsonb,last_action_at=now() where id=p_table;
 return jsonb_build_object('tableId',p_table,'button',button_no,'smallBlind',sb,'bigBlind',bb,'version',t.version+1);
end $function$;

DROP TRIGGER IF EXISTS poker_dealt_count_v1 ON public.poker_tables_v1;
CREATE TRIGGER poker_dealt_count_v1 BEFORE UPDATE ON public.poker_tables_v1
FOR EACH ROW EXECUTE FUNCTION public.poker_capture_dealt_count_v1();

REVOKE ALL ON FUNCTION public.poker_action_v1(p_table uuid, p_actor uuid, p_action_id uuid, p_version bigint, p_action text, p_amount bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_advance_v1(p_table uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_capture_dealt_count_v1() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_create_v1(p_owner uuid, p_stack bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_event_publish_v1(p_event uuid, p_actor uuid, p_version bigint, p_request uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_event_register_v1(p_event uuid, p_actor uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_event_start_v1(p_event uuid, p_actor uuid, p_version bigint, p_request uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_event_sync_v1(p_event uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_event_tick_v1(p_event uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_join_v1(p_table uuid, p_actor uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_settle_v1(p_table uuid, p_version bigint, p_awards jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_start_v1(p_table uuid, p_owner uuid, p_deck jsonb, p_commitment text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.poker_start_v2(p_table uuid, p_owner uuid, p_deck jsonb, p_commitment text, p_seed text, p_hand_no integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.poker_action_v1(p_table uuid, p_actor uuid, p_action_id uuid, p_version bigint, p_action text, p_amount bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_advance_v1(p_table uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_capture_dealt_count_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_create_v1(p_owner uuid, p_stack bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_event_publish_v1(p_event uuid, p_actor uuid, p_version bigint, p_request uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_event_register_v1(p_event uuid, p_actor uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_event_start_v1(p_event uuid, p_actor uuid, p_version bigint, p_request uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_event_sync_v1(p_event uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_event_tick_v1(p_event uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_join_v1(p_table uuid, p_actor uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_settle_v1(p_table uuid, p_version bigint, p_awards jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_start_v1(p_table uuid, p_owner uuid, p_deck jsonb, p_commitment text) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_start_v2(p_table uuid, p_owner uuid, p_deck jsonb, p_commitment text, p_seed text, p_hand_no integer) TO service_role;
-- Obsolete non-atomic hand start must not be called by the live service.
REVOKE ALL ON FUNCTION public.poker_start_v1(uuid,uuid,jsonb,text) FROM service_role;
