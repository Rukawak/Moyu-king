(()=>{
'use strict';
const SAVE_KEY='moyu_king_save_v1';
const VERSION=1;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
let deferredInstall=null;
let activePage='battle';
let pendingOffline=0;
let state;

const heroTemplates=[
  {id:'coffee',name:'咖啡战神',icon:'☕',base:14,skill:'咖啡因爆发',skillPower:30,cd:7},
  {id:'fish',name:'摸鱼剑客',icon:'🐟',base:17,skill:'老板不在',skillPower:38,cd:8},
  {id:'printer',name:'打印机法师',icon:'🖨️',base:12,skill:'卡纸风暴',skillPower:26,cd:6}
];
const slotNames={weapon:'武器',badge:'工牌',keyboard:'键盘',chair:'椅子'};
const enemyNames=['📎 实习主管','📋 项目经理','📞 客户代表','🧾 财务总监','👔 暴怒老板'];
const stageNames=['茶水间入口','会议室走廊','工位迷宫','打印区','老板办公室'];
const researchDefs=[
  {id:'damage',name:'摸鱼战术学',desc:'永久伤害 +5%/级',base:20},
  {id:'gold',name:'报销优化',desc:'金币收益 +5%/级',base:22},
  {id:'offline',name:'离线办公',desc:'离线收益效率 +10%/级',base:25},
  {id:'crit',name:'精准甩锅',desc:'暴击率 +2%/级',base:28}
];
const payBundles=[
  {yuan:6,gems:68},{yuan:30,gems:360},{yuan:68,gems:880},{yuan:198,gems:2880}
];
const goalDefs=[
  {id:'s5',name:'第一次摸进深水区',desc:'最高到达第5关',reward:'100金币'},
  {id:'p150',name:'有点像个团队了',desc:'战力达到150',reward:'30精华'},
  {id:'s10',name:'摸到老板门口',desc:'最高到达第10关',reward:'80钻石'},
  {id:'epic',name:'第一次史诗掉落',desc:'获得史诗或传说装备',reward:'50精华'},
  {id:'s20',name:'第一次转生资格',desc:'最高到达第20关',reward:'120钻石'},
  {id:'prestige1',name:'重新来过',desc:'完成1次转生',reward:'100精华'}
];

function freshState(){
  const heroes=heroTemplates.map(h=>({...h,lv:1,cool:0,unlocked:true}));
  return {
    version:VERSION,gold:150,essence:0,gems:0,spent:0,
    stage:1,best:1,legacy:0,prestiges:0,idleGold:0,lastSeen:Date.now(),
    teamHp:100,enemyHp:100,speed:1,autoSkill:true,
    runDamage:0,runGold:0,runCrit:0,battlePaused:false,
    heroes,
    equipped:{
      weapon:makeItem('weapon','common',true),
      badge:makeItem('badge','common',true),
      keyboard:makeItem('keyboard','rare',true),
      chair:null
    },
    inventory:[],
    research:{damage:0,gold:0,offline:0,crit:0},
    purchases:{monthly:false,growth:false,director:false},
    goals:{},firstCharge:{}
  };
}
function load(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    state=raw?migrate(JSON.parse(raw)):freshState();
  }catch(e){state=freshState()}
  const elapsed=Math.max(0,Date.now()-(state.lastSeen||Date.now()));
  if(elapsed>60000){
    const mins=Math.min(elapsed/60000,8*60);
    const base=Math.max(2,state.best*1.6);
    const eff=.25+(state.research.offline||0)*.10+vip()*0.04;
    pendingOffline=Math.floor(mins*base*eff);
  }
  state.lastSeen=Date.now();
  // 三选一/随机事件属于瞬时 UI，不跨刷新保存；重新打开游戏时自动继续挂机。
  state.battlePaused=false;
  state.enemyHp=Math.min(state.enemyHp||enemyMaxHp(),enemyMaxHp());
}
function migrate(s){
  const d=freshState();
  s={...d,...s};
  s.research={...d.research,...(s.research||{})};
  s.purchases={...d.purchases,...(s.purchases||{})};
  s.goals={...(s.goals||{})};
  s.firstCharge={...(s.firstCharge||{})};
  s.heroes=Array.isArray(s.heroes)&&s.heroes.length?s.heroes:d.heroes;
  s.equipped={...d.equipped,...(s.equipped||{})};
  s.inventory=Array.isArray(s.inventory)?s.inventory:[];
  s.version=VERSION;
  return s;
}
function save(msg){
  state.lastSeen=Date.now();
  const snapshot={...state,battlePaused:false};
  localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot));
  if(msg) $('#saveInfo').textContent=msg;
}
function vip(){
  return state.spent>=500?5:state.spent>=200?4:state.spent>=100?3:state.spent>=30?2:state.spent>=6?1:0;
}
function legacyBonus(){return state.legacy*8}
function researchDamage(){return state.research.damage*5}
function researchGold(){return state.research.gold*5}
function gearStats(){
  const total={atk:0,gold:0,crit:0,hp:0};
  Object.values(state.equipped).filter(Boolean).forEach(g=>{
    total.atk+=g.atk*g.lv; total.gold+=g.gold; total.crit+=g.crit; total.hp+=g.hp;
  });
  return total;
}
function heroPower(){
  return state.heroes.filter(h=>h.unlocked!==false).reduce((a,h)=>a+h.base*h.lv,0);
}
function totalDamageBonus(){return legacyBonus()+researchDamage()+state.runDamage+(state.purchases.growth?25:0)}
function totalGoldBonus(){
  const gs=gearStats();
  return legacyBonus()+researchGold()+state.runGold+gs.gold+(state.purchases.monthly?15:0);
}
function totalPower(){
  const gs=gearStats();
  return Math.floor((heroPower()+gs.atk)*(1+totalDamageBonus()/100));
}
function critChance(){return Math.min(70,5+gearStats().crit+state.research.crit*2+state.runCrit)}
function enemyPower(){return Math.floor(30+state.stage*11+state.stage*state.stage*1.7)}
function enemyMaxHp(){return Math.floor(92+state.stage*16+state.stage*state.stage*1.2)}
function heroCost(h){return Math.floor(25+h.lv*h.lv*15)}
function researchCost(def){return Math.floor(def.base*Math.pow(1.65,state.research[def.id]||0))}
function rarityName(r){return {common:'普通',rare:'稀有',epic:'史诗',legend:'传说'}[r]}
function rarityMult(r){return {common:1,rare:1.7,epic:2.8,legend:4.5}[r]}
function makeItem(slot,rarity,starter=false){
  const names={
    weapon:['订书机','钢尺','红色签字笔','摸鱼短剑'],
    badge:['临时工牌','正式工牌','主管工牌','隐身工牌'],
    keyboard:['薄膜键盘','机械键盘','静音键盘','量子键盘'],
    chair:['塑料凳','办公椅','人体工学椅','老板椅']
  };
  const arr=names[slot];
  const mult=rarityMult(rarity);
  const idx=starter?Math.min(arr.length-1,rarity==='rare'?1:0):Math.floor(Math.random()*arr.length);
  const base=slot==='weapon'?7:slot==='keyboard'?5:slot==='chair'?3:2;
  return {
    id:'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
    slot,name:arr[idx],rarity,lv:1,
    atk:Math.max(1,Math.round(base*mult)),
    gold:slot==='badge'?Math.round(4*mult):Math.random()<.28?Math.round(2*mult):0,
    crit:slot==='keyboard'?Math.round(2*mult):Math.random()<.22?Math.round(mult):0,
    hp:slot==='chair'?Math.round(7*mult):0
  };
}
function rollRarity(boss){
  const x=Math.random();
  if(boss){
    if(x>.93)return'legend'; if(x>.72)return'epic'; if(x>.32)return'rare'; return'common';
  }
  if(x>.985)return'legend'; if(x>.91)return'epic'; if(x>.63)return'rare'; return'common';
}
function setLog(t){$('#battleLog').textContent=t}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

function renderTop(){
  $('#gold').textContent=Math.floor(state.gold);
  $('#essence').textContent=Math.floor(state.essence);
  $('#gems').textContent=Math.floor(state.gems);
  $('#stage').textContent=state.stage;
  $('#best').textContent=state.best;
  $('#power').textContent=totalPower();
  $('#vip').textContent=vip();
}
function renderBattle(){
  const boss=state.stage%5===0;
  const idx=(state.stage-1)%5;
  $('#enemyName').textContent=(boss?'🔥 ':'')+enemyNames[idx];
  $('#enemyMeta').textContent=(boss?'Boss关':'普通关')+' · '+stageNames[idx]+' · 战力 '+enemyPower();
  const gs=gearStats();
  const maxTeam=100+gs.hp;
  state.teamHp=clamp(state.teamHp,0,maxTeam);
  state.enemyHp=clamp(state.enemyHp,0,enemyMaxHp());
  $('#teamHpText').textContent=Math.ceil(state.teamHp/maxTeam*100)+'%';
  $('#teamHpBar').style.width=(state.teamHp/maxTeam*100)+'%';
  $('#enemyHpText').textContent=Math.ceil(state.enemyHp/enemyMaxHp()*100)+'%';
  $('#enemyHpBar').style.width=(state.enemyHp/enemyMaxHp()*100)+'%';
  $('#idleGold').textContent=Math.floor(state.idleGold);
  $('#claimIdle').disabled=state.idleGold<=0;
  $('#speedBtn').textContent='×'+state.speed;
  $('#autoBtn').textContent='自动技能：'+(state.autoSkill?'开':'关');

  const skills=$('#skills'); skills.innerHTML='';
  state.heroes.filter(h=>h.unlocked!==false).slice(0,3).forEach(h=>{
    const b=document.createElement('button');
    b.type='button'; b.disabled=h.cool>0||state.battlePaused;
    b.innerHTML='<strong>'+h.icon+' '+h.skill+'</strong><small>'+(h.cool>0?'冷却 '+h.cool:'点击释放')+'</small>';
    b.addEventListener('click',()=>useSkill(h));
    skills.appendChild(b);
  });
}
function renderHeroes(){
  const box=$('#heroList'); box.innerHTML='';
  state.heroes.filter(h=>h.unlocked!==false).forEach(h=>{
    const el=document.createElement('div');el.className='item';
    const cost=heroCost(h);
    el.innerHTML='<div class="item-head"><div><strong>'+h.icon+' '+h.name+' · Lv.'+h.lv+'</strong><div class="meta">基础战力 '+(h.base*h.lv)+' · 技能 '+h.skill+' · 技能倍率 '+h.skillPower+'</div></div></div>';
    const actions=document.createElement('div');actions.className='item-actions';
    const up=document.createElement('button');up.type='button';up.textContent='升级 '+cost+'🪙';up.disabled=state.gold<cost;
    up.addEventListener('click',()=>{if(state.gold<cost)return;state.gold-=cost;h.lv++;setLog(h.name+' 升到 Lv.'+h.lv);renderAll();save()});
    actions.appendChild(up);el.appendChild(actions);box.appendChild(el);
  });
}
function itemMeta(g){
  return rarityName(g.rarity)+' · +'+g.lv+' · 攻击 '+(g.atk*g.lv)+(g.gold?' · 金币 '+g.gold+'%':'')+(g.crit?' · 暴击 '+g.crit+'%':'')+(g.hp?' · 生命 '+g.hp:'');
}
function renderGear(){
  const gs=gearStats();
  $('#gearSummary').textContent='攻击 +'+gs.atk+' · 金币 +'+gs.gold+'% · 暴击 +'+gs.crit+'% · 生命 +'+gs.hp;
  const eq=$('#equippedList');eq.innerHTML='';
  Object.keys(slotNames).forEach(slot=>{
    const g=state.equipped[slot];
    const el=document.createElement('div');el.className='item '+(g?'rarity-'+g.rarity:'');
    el.innerHTML=g?'<strong>'+slotNames[slot]+' · '+g.name+'</strong><div class="meta">'+itemMeta(g)+'</div>':'<strong>'+slotNames[slot]+' · 空</strong><div class="meta">等待掉落装备</div>';
    eq.appendChild(el);
  });
  const inv=$('#inventoryList');inv.innerHTML='';
  if(!state.inventory.length){inv.innerHTML='<div class="empty">背包还是空的，继续推关会掉装备。</div>'}
  state.inventory.slice().sort((a,b)=>rarityMult(b.rarity)-rarityMult(a.rarity)).forEach(g=>{
    const el=document.createElement('div');el.className='item rarity-'+g.rarity;
    el.innerHTML='<strong>'+slotNames[g.slot]+' · '+g.name+'</strong><div class="meta">'+itemMeta(g)+'</div>';
    const act=document.createElement('div');act.className='item-actions';
    const equip=document.createElement('button');equip.type='button';equip.textContent='装备';
    equip.addEventListener('click',()=>equipItem(g.id));
    const salv=document.createElement('button');salv.type='button';salv.textContent='分解';
    salv.addEventListener('click',()=>salvageOne(g.id));
    act.append(equip,salv);el.appendChild(act);inv.appendChild(el);
  });
  const forgeCost=100+Object.values(state.equipped).filter(Boolean).reduce((a,g)=>a+g.lv*20,0);
  $('#forgeBtn').textContent='全体强化 '+forgeCost+'🪙';
  $('#forgeBtn').disabled=state.gold<forgeCost;
  $('#forgeBtn').dataset.cost=forgeCost;
}
function renderResearch(){
  const box=$('#researchList');box.innerHTML='';
  researchDefs.forEach(def=>{
    const lv=state.research[def.id]||0,cost=researchCost(def);
    const el=document.createElement('div');el.className='item';
    el.innerHTML='<div class="item-head"><div><strong>'+def.name+' · Lv.'+lv+'</strong><div class="meta">'+def.desc+'</div></div></div>';
    const act=document.createElement('div');act.className='item-actions';
    const b=document.createElement('button');b.type='button';b.textContent='研究 '+cost+'💠';b.disabled=state.essence<cost;
    b.addEventListener('click',()=>{if(state.essence<cost)return;state.essence-=cost;state.research[def.id]++;renderAll();save()});
    act.appendChild(b);el.appendChild(act);box.appendChild(el);
  });
}
function goalDone(id){
  if(id==='s5')return state.best>=5;
  if(id==='p150')return totalPower()>=150;
  if(id==='s10')return state.best>=10;
  if(id==='epic')return [...Object.values(state.equipped),...state.inventory].filter(Boolean).some(g=>g.rarity==='epic'||g.rarity==='legend');
  if(id==='s20')return state.best>=20;
  if(id==='prestige1')return state.prestiges>=1;
  return false;
}
function claimGoal(id){
  if(state.goals[id]||!goalDone(id))return;
  if(id==='s5')state.gold+=100;
  if(id==='p150')state.essence+=30;
  if(id==='s10')state.gems+=80;
  if(id==='epic')state.essence+=50;
  if(id==='s20')state.gems+=120;
  if(id==='prestige1')state.essence+=100;
  state.goals[id]=true;renderAll();save();
}
function renderGoals(){
  const box=$('#goalList');box.innerHTML='';
  goalDefs.forEach(g=>{
    const done=goalDone(g.id),claimed=!!state.goals[g.id];
    const el=document.createElement('div');el.className='item';
    el.innerHTML='<strong>'+g.name+'</strong><div class="meta">'+g.desc+' · 奖励 '+g.reward+'</div>';
    const act=document.createElement('div');act.className='item-actions';
    const b=document.createElement('button');b.type='button';b.textContent=claimed?'已领取':done?'领取':'未完成';b.disabled=claimed||!done;
    b.addEventListener('click',()=>claimGoal(g.id));act.appendChild(b);el.appendChild(act);box.appendChild(el);
  });
  const gain=Math.max(0,Math.floor(state.stage/20));
  $('#prestigeGain').textContent=gain;
  $('#prestigeBtn').disabled=state.stage<20;
  $('#prestigeBtn').textContent=state.stage<20?'20关解锁':'转生并获得 '+gain+' 点摸鱼值';
}
function renderShop(){
  const pay=$('#payList');pay.innerHTML='';
  payBundles.forEach(p=>{
    const b=document.createElement('button');b.type='button';
    const first=!state.firstCharge[p.yuan];
    b.innerHTML='<strong>¥'+p.yuan+'</strong><br><span>'+(first?'首充双倍 ':'')+(first?p.gems*2:p.gems)+'💎</span>';
    b.addEventListener('click',()=>simulatePay(p));
    pay.appendChild(b);
  });
  const box=$('#fixedShop');box.innerHTML='';
  const items=[
    {id:'monthly',name:'月卡',price:30,desc:'金币收益永久 +15%',bought:state.purchases.monthly,buy:()=>state.purchases.monthly=true},
    {id:'director',name:'传奇员工礼包',price:300,desc:'直接解锁「摸鱼总监」',bought:state.purchases.director,buy:buyDirector},
    {id:'growth',name:'成长基金',price:500,desc:'永久伤害 +25%',bought:state.purchases.growth,buy:()=>state.purchases.growth=true}
  ];
  items.forEach(it=>{
    const el=document.createElement('div');el.className='item';
    el.innerHTML='<strong>'+it.name+'</strong><div class="meta">'+it.desc+' · '+it.price+'💎</div>';
    const act=document.createElement('div');act.className='item-actions';
    const b=document.createElement('button');b.type='button';b.textContent=it.bought?'已购买':'购买';b.disabled=it.bought||state.gems<it.price;
    b.addEventListener('click',()=>{if(it.bought||state.gems<it.price)return;state.gems-=it.price;it.buy();renderAll();save()});
    act.appendChild(b);el.appendChild(act);box.appendChild(el);
  });
}
function renderSave(){
  $('#saveInfo').textContent='最近自动保存：'+new Date(state.lastSeen).toLocaleString();
}
function renderAll(){renderTop();renderBattle();renderHeroes();renderGear();renderResearch();renderGoals();renderShop();renderSave()}

function useSkill(h){
  if(h.cool>0||state.battlePaused)return;
  const dmg=Math.floor(h.skillPower*(1+h.lv*.18)*(1+totalDamageBonus()/100));
  state.enemyHp-=dmg;h.cool=h.cd;
  setLog(h.name+' 使用「'+h.skill+'」，造成 '+dmg+' 点伤害。');
  if(state.enemyHp<=0)win();
  renderTop();renderBattle();save();
}
function maybeDrop(boss){
  const chance=boss?.82:.34;
  if(Math.random()>chance)return;
  if(state.inventory.length>=40){setLog('背包已满，掉落被自动分解成 3 精华。');state.essence+=3;return}
  const slots=Object.keys(slotNames);
  const item=makeItem(slots[Math.floor(Math.random()*slots.length)],rollRarity(boss));
  state.inventory.push(item);
  setLog('掉落 '+rarityName(item.rarity)+' '+item.name+'！');
}
function win(){
  const boss=state.stage%5===0;
  const reward=Math.floor((20+state.stage*5)*(1+totalGoldBonus()/100));
  state.gold+=reward;
  state.idleGold+=Math.floor(reward*(.25+vip()*.04));
  if(boss){state.essence+=8+state.stage;state.gems+=5}
  maybeDrop(boss);
  const cleared=state.stage;
  state.stage++;state.best=Math.max(state.best,state.stage);
  state.teamHp=100+gearStats().hp;state.enemyHp=enemyMaxHp();
  state.heroes.forEach(h=>h.cool=Math.max(0,h.cool-1));
  setLog((boss?'Boss击破！':'通关！')+' 获得 '+reward+' 金币'+(boss?'、精华和钻石。':'。'));
  if(cleared%3===0){showChoice();return}
  if(Math.random()<.12){showEvent();return}
  save();
}
function lose(){
  state.teamHp=100+gearStats().hp;state.enemyHp=enemyMaxHp();
  const consolation=Math.max(3,Math.floor(state.stage/3));
  state.gold+=consolation;
  setLog('挑战失败，获得 '+consolation+' 金币。升级后会自动再战。');
}
function battleTick(){
  if(state.battlePaused)return;
  state.heroes.forEach(h=>{if(h.cool>0)h.cool--});
  if(state.autoSkill){
    const ready=state.heroes.filter(h=>h.unlocked!==false&&h.cool<=0);
    if(ready.length&&Math.random()<.38)useSkill(ready[Math.floor(Math.random()*ready.length)]);
  }
  if(state.battlePaused)return;
  const p=Math.max(1,totalPower()),e=Math.max(1,enemyPower());
  let dealt=(6+p/e*8)*state.speed;
  if(Math.random()*100<critChance())dealt*=1.8;
  const taken=(2.4+e/p*3.3)*state.speed;
  state.enemyHp-=dealt;
  state.teamHp-=taken;
  state.idleGold+=Math.max(1,1+vip());
  if(state.enemyHp<=0)win(); else if(state.teamHp<=0)lose();
  renderTop();renderBattle();
}
function showChoice(){
  state.battlePaused=true;
  const pool=[
    {name:'摸鱼效率',desc:'本轮伤害 +20%',apply:()=>state.runDamage+=20},
    {name:'偷偷接私活',desc:'本轮金币收益 +30%',apply:()=>state.runGold+=30},
    {name:'咖啡续命',desc:'本轮暴击率 +10%',apply:()=>state.runCrit+=10},
    {name:'领导出差',desc:'立即获得 180 金币',apply:()=>state.gold+=180},
    {name:'集体培训',desc:'所有已解锁英雄 +1 级',apply:()=>state.heroes.filter(h=>h.unlocked!==false).forEach(h=>h.lv++)}
  ].sort(()=>Math.random()-.5).slice(0,3);
  const box=$('#choiceList');box.innerHTML='';
  pool.forEach(o=>{
    const b=document.createElement('button');b.type='button';
    b.innerHTML='<strong>'+o.name+'</strong><span>'+o.desc+'</span>';
    b.addEventListener('click',()=>{o.apply();state.battlePaused=false;$('#choicePanel').classList.add('hidden');setLog('获得策略：'+o.name);renderAll();save()});
    box.appendChild(b);
  });
  $('#choicePanel').classList.remove('hidden');
}
function showEvent(){
  state.battlePaused=true;
  const events=[
    {text:'老板临时外出两小时，你准备怎么利用？',choices:[
      {name:'全员摸鱼',desc:'立即获得 120 金币',apply:()=>state.gold+=120},
      {name:'偷偷研究',desc:'获得 18 精华',apply:()=>state.essence+=18}
    ]},
    {text:'客户突然要求改需求，项目组陷入混乱。',choices:[
      {name:'正面硬刚',desc:'英雄全体 +1 级',apply:()=>state.heroes.filter(h=>h.unlocked!==false).forEach(h=>h.lv++)},
      {name:'甩锅外包',desc:'失去 40 金币，获得 30 精华',apply:()=>{state.gold=Math.max(0,state.gold-40);state.essence+=30}}
    ]},
    {text:'茶水间发现一箱神秘能量饮料。',choices:[
      {name:'全部喝掉',desc:'本轮伤害 +12%、暴击 +5%',apply:()=>{state.runDamage+=12;state.runCrit+=5}},
      {name:'拿去卖掉',desc:'获得 160 金币',apply:()=>state.gold+=160}
    ]}
  ];
  const ev=events[Math.floor(Math.random()*events.length)];
  $('#eventText').textContent=ev.text;
  const box=$('#eventList');box.innerHTML='';
  ev.choices.forEach(c=>{
    const b=document.createElement('button');b.type='button';
    b.innerHTML='<strong>'+c.name+'</strong><span>'+c.desc+'</span>';
    b.addEventListener('click',()=>{c.apply();state.battlePaused=false;$('#eventPanel').classList.add('hidden');setLog('事件选择：'+c.name);renderAll();save()});
    box.appendChild(b);
  });
  $('#eventPanel').classList.remove('hidden');
}
function equipItem(id){
  const i=state.inventory.findIndex(g=>g.id===id);if(i<0)return;
  const item=state.inventory[i],old=state.equipped[item.slot];
  state.equipped[item.slot]=item;state.inventory.splice(i,1);
  if(old)state.inventory.push(old);
  state.teamHp=Math.min(state.teamHp,100+gearStats().hp);
  renderAll();save();
}
function salvageValue(g){return {common:2,rare:5,epic:15,legend:40}[g.rarity]}
function salvageOne(id){
  const i=state.inventory.findIndex(g=>g.id===id);if(i<0)return;
  const g=state.inventory[i];state.essence+=salvageValue(g);state.inventory.splice(i,1);renderAll();save();
}
function salvageLow(){
  let gain=0;
  state.inventory=state.inventory.filter(g=>{
    if(g.rarity==='common'||g.rarity==='rare'){gain+=salvageValue(g);return false}
    return true;
  });
  state.essence+=gain;setLog('批量分解获得 '+gain+' 精华。');renderAll();save();
}
function forgeAll(){
  const cost=Number($('#forgeBtn').dataset.cost||0);if(state.gold<cost)return;
  state.gold-=cost;Object.values(state.equipped).filter(Boolean).forEach(g=>g.lv++);renderAll();save();
}
function buyDirector(){
  state.purchases.director=true;
  if(!state.heroes.some(h=>h.id==='director')){
    state.heroes.push({id:'director',name:'摸鱼总监',icon:'🕶️',base:55,skill:'全员静默摸鱼',skillPower:100,cd:9,lv:1,cool:0,unlocked:true});
  }
}
function simulatePay(p){
  const first=!state.firstCharge[p.yuan],gain=first?p.gems*2:p.gems;
  state.spent+=p.yuan;state.gems+=gain;state.firstCharge[p.yuan]=true;
  setLog('模拟充值 ¥'+p.yuan+'，获得 '+gain+' 钻石。');renderAll();save();
}
function prestige(){
  if(state.stage<20)return;
  const gain=Math.max(1,Math.floor(state.stage/20));
  state.legacy+=gain;state.prestiges++;state.stage=1;state.gold=150+state.legacy*25;state.idleGold=0;
  state.runDamage=state.runGold=state.runCrit=0;state.teamHp=100+gearStats().hp;state.enemyHp=enemyMaxHp();
  state.heroes.filter(h=>h.id!=='director'||state.purchases.director).forEach(h=>{h.lv=1;h.cool=0});
  setLog('转生完成，获得 '+gain+' 点永久摸鱼值。');switchPage('battle');renderAll();save();
}
function claimOffline(){
  state.gold+=pendingOffline;$('#offlineModal').classList.add('hidden');setLog('领取离线收益 '+pendingOffline+' 金币。');pendingOffline=0;renderAll();save();
}
function switchPage(page){
  activePage=page;
  $$('.page').forEach(x=>x.classList.remove('active'));
  $('#page-'+page).classList.add('active');
  $$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  if(page==='save')renderSave();
  window.scrollTo({top:0,behavior:'smooth'});
}
function exportSave(){
  save();
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='moyu-king-save-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function importSaveFile(file){
  const r=new FileReader();
  r.onload=()=>{
    try{state=migrate(JSON.parse(r.result));state.lastSeen=Date.now();save('导入成功');renderAll();switchPage('battle')}
    catch(e){alert('存档文件无法读取')}
  };
  r.readAsText(file);
}
function resetGame(){
  if(!confirm('确定重开新档吗？当前本地进度会被覆盖。'))return;
  state=freshState();state.enemyHp=enemyMaxHp();save('已创建新档');renderAll();switchPage('battle');
}

$$('.nav').forEach(b=>b.addEventListener('click',()=>switchPage(b.dataset.page)));
$('#speedBtn').addEventListener('click',()=>{
  const max=vip()>=3?4:vip()>=1?2:1;
  state.speed=state.speed>=max?1:state.speed*2;
  if(max===1)setLog('VIP1 解锁 2 倍速，VIP3 解锁 4 倍速。');
  renderBattle();save();
});
$('#autoBtn').addEventListener('click',()=>{state.autoSkill=!state.autoSkill;renderBattle();save()});
$('#claimIdle').addEventListener('click',()=>{state.gold+=state.idleGold;setLog('领取挂机金币 '+Math.floor(state.idleGold));state.idleGold=0;renderAll();save()});
$('#forgeBtn').addEventListener('click',forgeAll);
$('#salvageBtn').addEventListener('click',salvageLow);
$('#prestigeBtn').addEventListener('click',prestige);
$('#saveNow').addEventListener('click',()=>{save('已手动保存：'+new Date().toLocaleString());renderSave()});
$('#exportSave').addEventListener('click',exportSave);
$('#importSave').addEventListener('click',()=>$('#fileInput').click());
$('#fileInput').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importSaveFile(f);e.target.value=''});
$('#resetBtn').addEventListener('click',resetGame);
$('#offlineClaim').addEventListener('click',claimOffline);
$('#installBtn').addEventListener('click',async()=>{
  if(deferredInstall){
    deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;
  }else{
    $('#installInfo').textContent='如果没有弹窗：打开浏览器菜单，选择“添加到主屏幕”或“安装应用”。';
  }
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#installInfo').textContent='现在可以直接点“添加到主屏幕”。'});
window.addEventListener('appinstalled',()=>{$('#installInfo').textContent='已经安装到主屏幕。';deferredInstall=null});
window.addEventListener('pagehide',()=>save());
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){
    save();
  }else{
    state.battlePaused=false;
    battleTick();
  }
});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});

load();
state.enemyHp=state.enemyHp||enemyMaxHp();
renderAll();
if(pendingOffline>0){
  $('#offlineText').textContent='离线期间累计 '+pendingOffline+' 金币（最多计算 8 小时）。';
  $('#offlineModal').classList.remove('hidden');
}
let battleTimer=null;
function startBattleLoop(){
  if(battleTimer) clearInterval(battleTimer);
  state.battlePaused=false;
  battleTick(); // 打开页面后立即发生一次战斗结算，不再等第一个 850ms
  battleTimer=setInterval(()=>{
    try{
      battleTick();
    }catch(err){
      console.error('battle loop error',err);
      state.battlePaused=false;
    }
  },850);
}
startBattleLoop();
setInterval(()=>save(),5000);
})();