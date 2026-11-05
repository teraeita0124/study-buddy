/* 依存のない純粋関数。ブラウザとNode.jsの両方でテスト可能。 */
export function localDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function addDays(day, offset) {
  const [y,m,d] = day.split('-').map(Number);
  return localDate(new Date(y,m-1,d+offset,12));
}
export function startDelayMinutes(startedAt, day, plannedTime) {
  if (!plannedTime || !/^\d{2}:\d{2}$/.test(plannedTime)) return null;
  const [y,m,d] = day.split('-').map(Number);
  const [hh,mm] = plannedTime.split(':').map(Number);
  const intended = new Date(y,m-1,d,hh,mm).getTime();
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.round((started-intended)/60000));
}
export function durationMinutes(session) { return Number(session?.durationMin) || 0; }
export function sessionsForDay(sessions,day) {return sessions.filter(s=>s.date===day);}
export function sumMinutes(sessions) {return Math.round(sessions.reduce((a,s)=>a+durationMinutes(s),0)*10)/10;}
export function average(values) {const clean=values.filter(Number.isFinite);return clean.length?clean.reduce((a,b)=>a+b,0)/clean.length:null;}
export function lastDays(day, n=7) {return Array.from({length:n},(_,i)=>addDays(day,i-n+1));}
export function weeklyTotals(sessions,day,n=7) {return lastDays(day,n).map(date=>({date,minutes:sumMinutes(sessionsForDay(sessions,date))}));}
export function plannedCompletion(tasks,day) {
  const list=tasks.filter(t=>t.date===day);
  return {done:list.filter(t=>t.done).length,total:list.length};
}
export function pickStudyTip({obstacle='',tasks=[],day='',sessions=[]}={}) {
  const s=(obstacle||'').toLowerCase();
  const todayTasks=tasks.filter(t=>t.date===day&&!t.done);
  if(/休憩|戻れ|再開/.test(s)) return {title:'休憩前に「次の1問」を決めよう',body:'休憩終了の合図と、戻って最初に解く問題を決めます。タイマー後に戻るまでの時間を測りましょう。',key:'return'};
  if(/分から|わから|方法|何を|勉強法/.test(s)) return {title:'勉強法を「最初の一手」に変えよう',body:'教科を1つに絞り、例題を確認してから解説を隠して1問解く。翌日、同程度の問題で理解を確認しましょう。',key:'method'};
  if(/眠|疲れ|集中/.test(s)) return {title:'まず学習環境を整えよう',body:'机の上を整え、通知を切り、短めの学習ブロックから始めましょう。睡眠や体調の記録を学習成果そのものと混同しないことも大切です。',key:'environment'};
  if(/始め|やる気|気が乗ら|先延/.test(s)) return {title:'始めるハードルを1分に下げよう',body:'開始時刻と最初の1問だけ決めてください。「机に座る→問題を開く」までを行動の合図にします。',key:'start'};
  if(todayTasks.length) return {title:`「${todayTasks[0].subject||'学習'}」の最初の一問から始めよう`,body:todayTasks[0].firstAction||'課題を小さく分け、まず取り組む一問を決めましょう。',key:'task'};
  if(sessions.length) return {title:'記録を次の計画につなげよう',body:'昨日できたことと引っかかったことを確認し、今日の開始時刻・最初の課題・終了条件を決めましょう。',key:'review'};
  return {title:'今日の学びを3つだけ決めよう',body:'①始める時刻、②最初の一問、③今日の終了条件。予定は小さく、実行できる形にします。',key:'begin'};
}
export function nextExperimentalCondition(sessions, pending=null, randomValue=0.5) {
  if (pending==='A'||pending==='B') return pending;
  const conditions=sessions.map(s=>s.condition).filter(x=>x==='A'||x==='B');
  // 2セッション単位のブロック割付。第1回をランダムにし第2回は反対条件。
  if(conditions.length%2===1) return conditions[conditions.length-1]==='A'?'B':'A';
  return randomValue<0.5?'A':'B';
}
export function experimentSummary(sessions){
  return ['A','B'].map(condition=>{
    const items=sessions.filter(s=>s.condition===condition);
    return {condition,count:items.length,minutes:average(items.map(durationMinutes)),focus:average(items.map(s=>Number(s.focusRating)||NaN)),delay:average(items.map(s=>s.startDelayMin==null?NaN:Number(s.startDelayMin)))};
  });
}
export function safeNumber(value,defaultValue,min,max){
  const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):defaultValue;
}
export function normalizeImportedState(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)throw new Error('対応していないデータ形式です');
  if(!Array.isArray(value.tasks)||!Array.isArray(value.sessions)||!Array.isArray(value.checks)||typeof value.plans!=='object'||!value.plans||typeof value.reviews!=='object'||!value.reviews)throw new Error('必須データがありません');
  if(value.tasks.length>20000||value.sessions.length>50000||value.checks.length>100000)throw new Error('データ量が多すぎます');
  return {...value,profile:{...defaultState().profile,...(value.profile||{})},ui:{tab:'home',planDate:localDate()},timer:null,pendingCondition:null,researchEnabled:!!value.researchEnabled};
}
export function defaultState(){
 return {version:1,profile:{name:'',grade:'',focusMinutes:25,breakMinutes:5,tipTopic:'start'},plans:{},tasks:[],sessions:[],checks:[],reviews:{},timer:null,researchEnabled:false,pendingCondition:null,ui:{tab:'home',planDate:localDate()}};
}
