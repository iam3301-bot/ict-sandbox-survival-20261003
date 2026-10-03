'use strict';
/*
 * 无头测试: 真实驱动 Game.update 步进 600 秒 (36000 步), 覆盖昼夜/僵尸生成/天亮清场/天数,
 * 并对出生安全、跳跃缓冲、移动碰撞、挖掘放置、四档工具等级、工作台距离、满包合成、
 * 四档剑伤害与击杀金币、攻击冷却、接触伤害与无敌帧做实际断言。
 * 另用轻量 Canvas stub 实际渲染昼/夜/地下/背包/帮助, 确保绘制路径不抛错。
 * 运行: node test-headless.js
 */
const Game = require('./game.js');
const T = Game.T, TILE = Game.TILE, STEP = Game.STEP_MS, ITEMS = Game.ITEMS;

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  FAIL: ' + name); } }
function overlap(g) {
  const p = g.player;
  const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 0.001) / TILE);
  const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 0.001) / TILE);
  let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g.isSolid(x, y)) n++; return n;
}
function findTile(g, id) { for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) if (g.getTile(x, y) === id) return { x: x, y: y }; return null; }
function selectItem(g, id) { for (let i = 0; i < g.inv.length; i++) if (g.inv[i].item === id) { g.selected = i; return i; } return -1; }
function makeStubCtx() {
  const calls = { fillRect: 0, fillText: 0, arc: 0, strokeRect: 0, grad: 0 };
  const grad = { addColorStop: function () {} };
  const ctx = {
    fillStyle: null, strokeStyle: null, lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: false,
    createLinearGradient: function () { calls.grad++; return grad; },
    createRadialGradient: function () { calls.grad++; return grad; },
    fillRect: function () { calls.fillRect++; },
    strokeRect: function () { calls.strokeRect++; },
    beginPath: function () {}, arc: function () { calls.arc++; }, fill: function () {},
    fillText: function () { calls.fillText++; }, measureText: function (s) { return { width: ((s || '') + '').length * 7 }; },
    save: function () {}, restore: function () {}, clearRect: function () {}
  };
  ctx.__calls = calls;
  return ctx;
}

console.log('=== 2D 沙盒生存 · 无头测试 ===');

// ---------- 1. 600 秒昼夜模拟 ----------
(function sim600() {
  const g = new Game({ headless: true, seed: 12345, dayLen: 120000, maxZombies: 12 });
  const totalSteps = 36000; // 600s @ 60Hz
  let completed = false, nightSpawned = false, dawnClear = false, maxZ = 0, cycles = 0;
  let dawns = 0, dawnBad = false, executedSteps = 0;
  let prevPhase = g.dayPhase(), prevDay = g.dayCount, nightMax = 0, nanHit = false;
  const t0 = Date.now();
  for (let i = 0; i < totalSteps; i++) {
    g.update(STEP); executedSteps++;
    const ph = g.dayPhase();
    if (ph < prevPhase - 0.5) cycles++;
    prevPhase = ph;
    if (g.isNight()) { nightMax = Math.max(nightMax, g.zombies.length); if (g.zombies.length > 0) nightSpawned = true; }
    if (g.dayCount > prevDay) { dawns++; if (g.zombies.length !== 0) dawnBad = true; if (nightMax > 0) dawnClear = true; nightMax = 0; prevDay = g.dayCount; }
    if (g.zombies.length > maxZ) maxZ = g.zombies.length;
    const p = g.player;
    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.vx) || !isFinite(p.vy) || !isFinite(g.dayTime)) { nanHit = true; break; }
    for (let z = 0; z < g.zombies.length; z++) if (!isFinite(g.zombies[z].x) || !isFinite(g.zombies[z].y)) { nanHit = true; break; }
    if (nanHit) break;
  }
  completed = !nanHit && executedSteps === totalSteps;
  const secs = ((Date.now() - t0) / 1000).toFixed(2);
  ok('600s 完成 36000 步', completed);
  ok('600s 无 NaN', !nanHit);
  ok('600s 夜晚生成僵尸', nightSpawned);
  ok('600s 每次天亮僵尸全部清场', dawnClear && !dawnBad && dawns === 5);
  ok('600s 天数增加', g.dayCount > 1);
  ok('600s 僵尸数量不超上限', maxZ <= 12);
  ok('600s 经历多个昼夜循环', cycles >= 2);
  console.log('  [600s] 模拟 ' + (totalSteps * STEP / 1000) + 's, 实耗 ' + secs + 's, dayCount=' + g.dayCount + ', maxZombies=' + maxZ + ', cycles~' + cycles);
})();

// ---------- 2. 50 种子安全出生/重生 ----------
(function safeSpawn() {
  const bad = [];
  for (let s = 0; s < 50; s++) {
    const g = new Game({ headless: true, seed: s });
    if (overlap(g) > 0) bad.push(s + ':spawn');
    for (let i = 0; i < 120; i++) g.update(STEP);
    if (overlap(g) > 0) bad.push(s + ':120');
    g.player.hp = 0; g.respawn();
    if (overlap(g) > 0) bad.push(s + ':respawn');
    for (let i = 0; i < 60; i++) g.update(STEP);
    if (overlap(g) > 0) bad.push(s + ':respawn60');
  }
  ok('50 种子出生/重生不卡墙', bad.length === 0);
  if (bad.length) console.log('  bad:', bad.join(','));
})();

// ---------- 3. 短按跳跃 + 缓冲 ----------
(function jump() {
  const g = new Game({ headless: true, seed: 1 });
  for (let i = 0; i < 60; i++) g.update(STEP);
  const g0 = g.player.y;
  g.setKey('w', true); g.setKey('w', false); g.update(STEP);
  let up = false; for (let i = 0; i < 20; i++) { g.update(STEP); if (g.player.y < g0 - 4) up = true; }
  ok('短按跳跃', up);

  const g2 = new Game({ headless: true, seed: 2 });
  for (let i = 0; i < 60; i++) g2.update(STEP);
  const p = g2.player;
  const pcx = Math.floor((p.x + p.w / 2) / TILE);
  const py = Math.floor((p.y + p.h) / TILE);
  if (!g2.isSolid(pcx, py)) g2.setTile(pcx, py, T.STONE);
  // 将玩家抬离地面 6px, 模拟空中短按; 落地在 120ms 缓冲内, 落地即跳
  g2.player.y = py * TILE - g2.player.h - 6;
  g2.player.vy = 0; g2.player.onGround = false;
  let tapped = false, landed = false, jumpedAfterLand = false;
  for (let i = 0; i < 40; i++) {
    if (!g2.player.onGround && !tapped) { g2.setKey('w', true); g2.setKey('w', false); tapped = true; }
    g2.update(STEP);
    if (g2.player.onGround) landed = true;
    if (landed && g2.player.vy < -3) { jumpedAfterLand = true; break; }
  }
  ok('跳跃缓冲(空中短按落地即跳)', jumpedAfterLand);
})();

// ---------- 4. 移动与碰撞 ----------
(function move() {
  const g = new Game({ headless: true, seed: 1 });
  for (let i = 0; i < 60; i++) g.update(STEP);
  const startX = g.player.x;
  g.setKey('d', true);
  for (let i = 0; i < 60; i++) g.update(STEP);
  g.setKey('d', false);
  ok('向右移动', g.player.x > startX);
  ok('移动后不嵌入实心', overlap(g) === 0);
  // 建墙阻挡
  const p = g.player;
  const wallCol = Math.floor((p.x + p.w) / TILE) + 2;
  const wallY = Math.floor(p.y / TILE);
  for (let dy = 0; dy < 3; dy++) g.setTile(wallCol, wallY + dy, T.STONE);
  g.setKey('d', true);
  for (let i = 0; i < 120; i++) g.update(STEP);
  g.setKey('d', false);
  ok('被墙阻挡', g.player.x < wallCol * TILE - g.player.w + 1);
  ok('撞墙后不嵌入', overlap(g) === 0);
})();

// ---------- 5. 挖掘/放置 资源扣增 ----------
(function minePlace() {
  const g = new Game({ headless: true, seed: 1 });
  for (let i = 0; i < 60; i++) g.update(STEP);
  g.selectSlot(0); // 木镐
  const p = g.player;
  const tx = Math.floor((p.x + p.w / 2) / TILE) + 1;
  const ty = Math.floor((p.y + p.h) / TILE); // 脚边地面格
  const dirtBefore = g.countItem('dirt');
  const mined = g.mineTile(tx, ty);
  ok('挖掘泥土成功', mined && g.getTile(tx, ty) === T.AIR);
  ok('挖掘增加泥土', g.countItem('dirt') === dirtBefore + 1);
  // 放置: 把泥土换到快捷栏并选中
  g._addItem('dirt', 1);
  let dirtSlot = -1;
  for (let i = 0; i < 10; i++) if (g.inv[i].item === 'dirt') { dirtSlot = i; break; }
  if (dirtSlot < 0) { for (let i = 10; i < g.inv.length; i++) if (g.inv[i].item === 'dirt') { g.swapSlots(i, 5); dirtSlot = 5; break; } }
  g.selectSlot(dirtSlot);
  const dirtC = g.countItem('dirt');
  const placed = g.placeTile(tx, ty);
  ok('放置泥土成功', placed && g.getTile(tx, ty) === T.DIRT);
  ok('放置扣除泥土', g.countItem('dirt') === dirtC - 1);
})();

// ---------- 6. 四档镐等级限制 ----------
(function pickTier() {
  const g = new Game({ headless: true, seed: 7 });
  const iron = findTile(g, T.IRON), gold = findTile(g, T.GOLD), stone = findTile(g, T.STONE);
  function near(t) { g.player.x = t.x * TILE + 1; g.player.y = (t.y - 2) * TILE; }
  g.selectSlot(0); near(iron);
  ok('木镐不能挖铁矿(tier2)', g.mineTile(iron.x, iron.y) === false);
  g._addItem('pickaxe_stone', 1); selectItem(g, 'pickaxe_stone'); near(iron);
  ok('石镐可挖铁矿', g.mineTile(iron.x, iron.y) === true);
  near(gold);
  ok('石镐不能挖金矿(tier3)', g.mineTile(gold.x, gold.y) === false);
  g._addItem('pickaxe_iron', 1); selectItem(g, 'pickaxe_iron'); near(gold);
  ok('铁镐可挖金矿', g.mineTile(gold.x, gold.y) === true);
  g._addItem('pickaxe_gold', 1); selectItem(g, 'pickaxe_gold'); near(stone);
  ok('金镐可挖石头', g.mineTile(stone.x, stone.y) === true);
})();

// ---------- 7. 工作台距离限制 ----------
(function bench() {
  const g = new Game({ headless: true, seed: 1 });
  g._addItem('planks', 20); g._addItem('stick', 20);
  const c1 = g.canCraft(4); // 木镐 需工作台
  ok('无工作台时高级配方不可', c1.ok === false && c1.reason.indexOf('工作台') >= 0);
  const p = g.player;
  const wx = Math.floor((p.x + p.w / 2) / TILE) + 2, wy = Math.floor((p.y + p.h / 2) / TILE);
  g.setTile(wx, wy, T.WORKBENCH);
  ok('工作台距离<=4', g.nearestWorkbenchDist() <= 4);
  ok('靠近工作台可合成', g.canCraft(4).ok === true);
  g.setTile(wx, wy, T.AIR);
  g.setTile(wx + 8, wy, T.WORKBENCH); // >4 格
  ok('远工作台距离>4', g.nearestWorkbenchDist() > 4);
  ok('远离工作台不可合成', g.canCraft(4).ok === false);
})();

// ---------- 8. 满包合成不扣材料 ----------
(function fullCraft() {
  const g = new Game({ headless: true, seed: 1 });
  g._addItem('wood', 5);
  for (let i = 0; i < g.inv.length; i++) if (g.inv[i].item === null) { g.inv[i].item = 'stone'; g.inv[i].count = 99; }
  const wB = g.countItem('wood'), pB = g.countItem('planks');
  const r = g.craft(0); // 1 wood -> 4 planks
  ok('满包合成被拒', r.ok === false);
  ok('满包不扣材料', g.countItem('wood') === wB);
  ok('满包不出产物', g.countItem('planks') === pB);
})();

// ---------- 9. 四档剑伤害 + 击杀金币 ----------
(function swords() {
  const names = ['sword_wood', 'sword_stone', 'sword_iron', 'sword_gold'];
  const dmgs = [2, 4, 6, 9];
  for (let t = 0; t < 4; t++) {
    const g = new Game({ headless: true, seed: 1, dayLen: 1e9 });
    g._addItem(names[t], 1); selectItem(g, names[t]);
    g.spawnZombie(1);
    const z = g.zombies[0];
    g.player.x = z.x - g.player.w - 4; g.player.y = z.y; g.player.facing = 1;
    const hp0 = z.hp;
    g.tryAttack();
    ok(names[t] + ' 伤害=' + dmgs[t], z.hp === hp0 - dmgs[t]);
  }
  const gk = new Game({ headless: true, seed: 1, dayLen: 1e9 });
  gk._addItem('sword_gold', 1); selectItem(gk, 'sword_gold');
  gk.spawnZombie(1);
  const z = gk.zombies[0];
  gk.player.x = z.x - gk.player.w - 4; gk.player.y = z.y; gk.player.facing = 1;
  const coins0 = gk.player.coins;
  gk.tryAttack();
  ok('金剑一击击杀(hp8,dmg9)', gk.zombies.length === 0 || gk.zombies[0].hp <= 0);
  ok('击杀获得金币', gk.player.coins > coins0);
})();

// ---------- 10. 攻击冷却 ----------
(function attackCD() {
  const g = new Game({ headless: true, seed: 1, dayLen: 1e9 });
  g.selectSlot(1); // 木剑
  g.tryAttack();
  ok('攻击设置冷却', g.attackCooldown > 0);
  const cd = g.attackCooldown;
  g.tryAttack();
  ok('冷却中再攻击被阻挡', g.attackCooldown === cd);
  for (let i = 0; i < 25; i++) g.update(STEP);
  ok('冷却递减', g.attackCooldown < cd);
  for (let i = 0; i < 25; i++) g.update(STEP);
  ok('冷却归零', g.attackCooldown === 0);
})();

// ---------- 11. 接触伤害与无敌帧 ----------
(function contact() {
  const g = new Game({ headless: true, seed: 1, dayLen: 1e9 });
  for (let i = 0; i < 60; i++) g.update(STEP); // 落地稳定
  g.spawnZombie(1);
  const p = g.player, z = g.zombies[0];
  z.x = p.x; z.y = p.y; z.vx = 0; z.vy = 0; p.vx = 0; p.vy = 0;
  const hp0 = p.hp;
  g.update(STEP);
  ok('接触造成伤害', p.hp === hp0 - 1);
  ok('设置无敌帧', p.invuln > 0);
  const hp1 = p.hp;
  g.update(STEP);
  ok('无敌帧内不再受伤', p.hp === hp1);
  // 等无敌帧结束 (把僵尸移远避免再次接触)
  z.x = p.x + 1000; z.y = p.y;
  for (let i = 0; i < 80; i++) g.update(STEP);
  ok('无敌帧到期', p.invuln === 0);
  z.x = p.x; z.y = p.y; z.vx = 0; z.vy = 0; p.vx = 0; p.vy = 0; z.hp = 8;
  const hp2 = p.hp;
  g.update(STEP);
  ok('无敌帧到期后再次受伤', p.hp === hp2 - 1);
})();

// ---------- 12. Canvas stub 渲染 (昼/夜/地下/背包/帮助) ----------
(function render() {
  const g = new Game({ headless: true, seed: 1 });
  const ctx = makeStubCtx(); g.ctx = ctx; g.canvas = { width: g.viewW, height: g.viewH };
  g.dayTime = 0.25 * g.dayLen;
  let r1 = true; try { g.render(); } catch (e) { r1 = false; console.log('  render day err:', e.message); }
  ok('渲染白天不抛错', r1);
  ok('渲染白天有绘制', ctx.__calls.fillRect > 0);

  g.dayTime = 0.75 * g.dayLen;
  ctx.__calls.fillRect = 0;
  let r2 = true; try { g.render(); } catch (e) { r2 = false; console.log('  render night err:', e.message); }
  ok('渲染夜晚不抛错', r2);
  ok('渲染夜晚有绘制', ctx.__calls.fillRect > 0);

  const px = Math.floor(g.player.x / TILE);
  g.player.x = px * TILE + 1; g.player.y = (g.surface[px] + 30) * TILE;
  let r3 = true; try { g.render(); } catch (e) { r3 = false; console.log('  render underground err:', e.message); }
  ok('渲染地下不抛错', r3);

  g.showInv = true;
  let r4 = true; try { g.render(); } catch (e) { r4 = false; console.log('  render inv err:', e.message); }
  ok('渲染背包面板不抛错', r4);
  ok('背包面板有文字', ctx.__calls.fillText > 0);

  g.showInv = false; g.showHelp = true;
  let r5 = true; try { g.render(); } catch (e) { r5 = false; console.log('  render help err:', e.message); }
  ok('渲染帮助面板不抛错', r5);
  g.showHelp = false;
})();

// ---------- 13. 世界生成、屏幕外生成、重生保留建造 ----------
(function regressions() {
  let worldsOK = true, preserve = true, offscreen = true, spawned = 0;
  for (let seed = 0; seed < 50; seed++) {
    const g = new Game({headless: true, seed});
    let caves = 0;
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      if (y > g.surface[x] + 5 && g.getTile(x, y) === T.AIR) caves++;
    }
    if (!caves || !findTile(g,T.WOOD) || !findTile(g,T.COAL) || !findTile(g,T.IRON) || !findTile(g,T.GOLD)) worldsOK = false;
    const x = Math.floor(g.player.x / TILE);
    g.setTile(x + 1, Math.floor(g.player.y / TILE), T.WORKBENCH);
    const before = Buffer.from(g.world);
    g.respawn();
    if (!before.equals(Buffer.from(g.world))) preserve = false;
    if (g._spawnZombie()) {
      spawned++;
      const z = g.zombies[g.zombies.length - 1];
      if (z.x + z.w > g.camera.x && z.x < g.camera.x + g.viewW) offscreen = false;
    }
  }
  ok('50种子都有树/洞穴/煤铁金', worldsOK);
  ok('50种子重生不删除建造', preserve);
  ok('实际僵尸全部屏幕外生成', spawned === 50 && offscreen);
})();

(function craftSuccess() {
  const g = new Game({headless: true, seed: 4});
  const p = g.player;
  g.setTile(Math.floor(p.x/TILE)+2, Math.floor(p.y/TILE), T.WORKBENCH);
  for (const id of ['wood','planks','stick','coal','stone','iron','gold']) g._addItem(id,50);
  for (let i=0;i<Game.RECIPES.length;i++) {
    const r=Game.RECIPES[i], before=g.countItem(r.out.id);
    const needs=r.need.map(n=>({id:n.id,n:n.n,before:g.countItem(n.id)}));
    const result=g.craft(i);
    ok('实际合成 '+r.name, result.ok && g.countItem(r.out.id)===before+r.out.n && needs.every(n=>g.countItem(n.id)===n.before-n.n));
  }
})();

(function zombieJump() {
  const g=new Game({headless:true,seed:10});
  const row=60,col=130;
  for(let y=row-6;y<=row;y++) for(let x=col-6;x<=col+6;x++) g.setTile(x,y,y===row?T.STONE:T.AIR);
  g.setTile(col,row-1,T.STONE);
  g.player.x=(col+4)*TILE; g.player.y=row*TILE-g.player.h;
  const z={x:col*TILE-12,y:row*TILE-26,w:12,h:26,vx:0,vy:0,hp:8,maxHp:8,speed:1.5,onGround:true};
  g.zombies=[z]; g._updateZombies();
  ok('僵尸遇墙跳跃',z.blockedX && z.vy < -7);
})();

// ---------- 汇总 ----------
console.log('');
console.log('模拟秒数: 600 (36000 步 @ 60Hz)');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) { console.log('失败项: ' + fails.join(', ')); process.exit(1); }
console.log('全部断言通过 ✓');