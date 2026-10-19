-- Run manually against staging only. Uses existing *test* auth identities as participants.
-- All table, seat, action and chip mutations roll back. No service-role keys or credentials.
begin;
do $test$
declare
 people uuid[]; owner uuid; tid uuid; v public.poker_tables_v1%rowtype;
 actor public.poker_seats_v1%rowtype; cards jsonb;
 seed text; hash text; bad_turn_rejected boolean:=false;
 action_id uuid; receipt jsonb; i integer:=0; chip_total bigint; raised boolean:=false;
begin
 select array_agg(user_id order by user_id) into people
 from (select user_id from public.user_roles order by user_id limit 4) ids;
 if coalesce(array_length(people,1),0) <> 4 then
  raise exception 'Four distinct staging test identities required';
 end if;
 owner:=people[1];
 tid:=public.poker_create_v1(owner,1000);
 perform public.poker_join_v1(tid,people[2]);
 perform public.poker_join_v1(tid,people[3]);
 perform public.poker_join_v1(tid,people[4]);
 cards:=(select jsonb_agg(jsonb_build_object('rank',rank_no,'suit',suit) order by suit,rank_no)
   from unnest(array['c','d','h','s']) suit cross join generate_series(2,14) rank_no);
 seed:=encode(extensions.gen_random_bytes(32),'hex');
 hash:=encode(extensions.digest(seed||':'||tid::text||':1','sha256'),'hex');
 perform public.poker_start_v2(tid,owner,cards,hash,seed,1);
 select * into v from public.poker_tables_v1 where id=tid;
 if v.status<>'playing' or v.current_bet<>10 or v.dealt_count<>4 then
   raise exception 'Incorrect 4-player start or blinds';
 end if;
 if (select count(distinct private_hole::text) from public.poker_seats_v1 where table_id=tid)<>4 then
   raise exception 'Private card collision';
 end if;
 -- The server rejects a different user's action on the current turn.
 begin
  perform public.poker_action_v3(tid,(select user_id from public.poker_seats_v1
    where table_id=tid and seat_no<>v.turn_index limit 1),gen_random_uuid(),v.version,'fold',0,false);
 exception when others then bad_turn_rejected:=true;end;
 if not bad_turn_rejected then raise exception 'Wrong-seat action accepted';end if;
 while i<65 loop
  i:=i+1;
  select * into v from public.poker_tables_v1 where id=tid;
  exit when v.status='complete';
  if v.status='showdown' then
   if v.street='river' then
    -- Fixed award exercises chip accounting, NOT hand-ranking validation.
    perform public.poker_settle_v1(tid,v.version,jsonb_build_array(
      jsonb_build_object('seat',0,'chips',
        (select coalesce(sum(committed),0) from public.poker_seats_v1 where table_id=tid))));
   else
    perform public.poker_advance_v1(tid);
   end if;
  elsif v.status='playing' then
   select * into actor from public.poker_seats_v1
     where table_id=tid and seat_no=v.turn_index;
   action_id:=gen_random_uuid();
   if not raised and v.street='preflop' and actor.stack>25 then
    receipt:=public.poker_action_v3(tid,actor.user_id,action_id,v.version,
      'raise',v.current_bet+v.min_raise,false);
    if receipt<>public.poker_action_v3(tid,actor.user_id,action_id,v.version,
      'raise',v.current_bet+v.min_raise,false) then
      raise exception 'Idempotent replay did not match';
    end if;
    raised:=true;
   else
    perform public.poker_action_v3(tid,actor.user_id,action_id,v.version,
      case when v.current_bet>actor.street_bet then 'call' else 'check' end,0,false);
   end if;
  else raise exception 'Invalid hand status %',v.status;end if;
  select sum(stack+committed) into chip_total from public.poker_seats_v1 where table_id=tid;
  if chip_total<>4000 then raise exception 'Practice-chip conservation failed at step %',i;end if;
 end loop;
 select * into v from public.poker_tables_v1 where id=tid;
 if not raised or v.status<>'complete' or jsonb_array_length(v.board)<>5 then
  raise exception 'Full 4-player showdown was not reached';
 end if;
end $test$;
rollback;
select 'PASS: four-player poker test, 4000 practice chips conserved, no data retained' as result;
