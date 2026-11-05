import test from 'node:test';
import assert from 'node:assert/strict';
import {localDate,addDays,startDelayMinutes,sumMinutes,average,weeklyTotals,plannedCompletion,pickStudyTip,nextExperimentalCondition,experimentSummary,normalizeImportedState,defaultState} from '../core.mjs';

test('date helpers handle leap years and month boundaries',()=>{
 assert.equal(addDays('2024-02-28',1),'2024-02-29');
 assert.equal(addDays('2026-11-01',-1),'2026-10-31');
 assert.equal(localDate(new Date(2026,10,5,12)), '2026-11-05');
});
test('start delay counts only late starts and accepts missing plans',()=>{
 assert.equal(startDelayMinutes(new Date(2026,10,5,19,12).toISOString(),'2026-11-05','19:00'),12);
 assert.equal(startDelayMinutes(new Date(2026,10,5,18,50).toISOString(),'2026-11-05','19:00'),0);
 assert.equal(startDelayMinutes('2026-11-05T19:12:00+09:00','2026-11-05',''),null);
});
test('session aggregate and task progress',()=>{
 const sessions=[{date:'2026-11-04',durationMin:25},{date:'2026-11-05',durationMin:20.5},{date:'2026-11-05',durationMin:25}];
 assert.equal(sumMinutes(sessions),70.5);
 assert.equal(weeklyTotals(sessions,'2026-11-05',2)[1].minutes,45.5);
 assert.deepEqual(plannedCompletion([{date:'2026-11-05',done:true},{date:'2026-11-05',done:false}], '2026-11-05'),{done:1,total:2});
 assert.equal(average([]),null);
});
test('rule-based hints follow the last obstacle',()=>{
 assert.equal(pickStudyTip({obstacle:'休憩から戻れない'}).key,'return');
 assert.equal(pickStudyTip({obstacle:'勉強法が分からない'}).key,'method');
 assert.equal(pickStudyTip({obstacle:'やる気がない'}).key,'start');
});
test('A/B allocation balances pairs and descriptive counts',()=>{
 assert.equal(nextExperimentalCondition([],null,0.1),'A');
 assert.equal(nextExperimentalCondition([{condition:'A'}],null,0.7),'B');
 assert.equal(nextExperimentalCondition([{condition:'B'}],null,0.1),'A');
 assert.equal(nextExperimentalCondition([{condition:'A'},{condition:'B'}],null,0.7),'B');
 assert.deepEqual(experimentSummary([{condition:'A',durationMin:20,focusRating:4,startDelayMin:2},{condition:'B',durationMin:30,focusRating:3,startDelayMin:null}]).map(x=>x.count),[1,1]);
});
test('import validates mandatory structure',()=>{
 assert.throws(()=>normalizeImportedState({}),/対応していない/);
 const normal=normalizeImportedState(defaultState());
 assert.equal(normal.version,1);
 assert.equal(normal.timer,null);
});
