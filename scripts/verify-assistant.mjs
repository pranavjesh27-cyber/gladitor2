import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--port','3101'], {env:{...process.env,GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']});
let logs=''; server.stdout.on('data',d=>logs+=d); server.stderr.on('data',d=>logs+=d);
const base='http://127.0.0.1:3101';
try {
 let ready=false;
 for(let n=0;n<45;n++){try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2000)});if(r.ok){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,1000));}
 assert.ok(ready,'Server did not become ready');
 async function search(body){const r=await fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'en',...body})});assert.equal(r.status,200);return r.json();}
 const comparison=await search({query:'Compare bus and train from Perungudi to Guindy'});
 assert.equal(comparison.status,'found'); assert.ok(comparison.journeys.length>=2);assert.match(comparison.answerEnglish,/Board at/);
 const bus=await search({query:'bus only',previousJourneyContext:{originId:'perungudi',destinationId:'guindy'}});
 assert.equal(bus.status,'found');assert.ok(bus.journeys.every(j=>j.legs[0].mode==='bus'));
 const tamil=await search({query:'பெருங்குடியிலிருந்து கிண்டிக்கு எப்படிச் செல்வது?',language:'ta'});assert.equal(tamil.status,'found');assert.match(tamil.answer,/[\u0B80-\u0BFF]/);
 console.log('PASS: detailed route comparison, contextual bus-only follow-up, Tamil suffix parsing');
} catch(e){ console.error(e.message);console.error(logs.slice(-1500));process.exitCode=1; }
finally {server.kill();}
