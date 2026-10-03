'use strict';
/*
 * 2D 侧视沙盒生存游戏 (泰拉瑞亚风格) — 纯 HTML5 Canvas + 原生 JS
 * 第1阶段：地形/树/移动/跳跃/AABB碰撞/木镐挖掘/方块放置/10格快捷栏
 * 可被 Node require (headless) 用于无头测试。
 */
(function (global) {

  // ===================== 常量 =====================
  const TILE = 16;
  const GRAVITY = 0.55;
  const MOVE_ACCEL = 0.9;
  const MOVE_MAX = 3.4;
  const FRICTION = 0.78;
  const JUMP_SPEED = 8.6;
  const REACH = 5.5;            // 玩家可触及格数
  const MAX_HP = 20;
  const FPS = 60;
  const STEP_MS = 1000 / FPS;

  // 方块 ID
  const T = {
    AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, WOOD: 4, LEAVES: 5,
    COAL: 6, IRON: 7, GOLD: 8, PLANKS: 9, WORKBENCH: 10, TORCH: 11, SAND: 12
  };

  const SOLID = Object.create(null);
  [T.DIRT, T.GRASS, T.STONE, T.WOOD, T.LEAVES, T.COAL, T.IRON, T.GOLD,
   T.PLANKS, T.WORKBENCH, T.SAND].forEach(function (t) { SOLID[t] = true; });
  // TORCH 不阻挡通行，仅作光源。

  // 方块定义: name 中文名, color 主色, top 顶层色, drop 掉落物品id, tier 镐等级, placeable 可放置, light 光源
  const TILE_DEF = {
    1:  { name: '泥土',   color: '#7a4a2b', drop: 'dirt',     tier: 1 },
    2:  { name: '草地',   color: '#5a8b3a', top: '#6fb04a', drop: 'dirt', tier: 1 },
    3:  { name: '石头',   color: '#6b6b6b', drop: 'stone',    tier: 1 },
    4:  { name: '木头',   color: '#6b4220', drop: 'wood',     tier: 1 },
    5:  { name: '树叶',   color: '#3a6b2a', drop: 'leaves',   tier: 1 },
    6:  { name: '煤矿',   color: '#2a2a2a', spot: '#101010', drop: 'coal',  tier: 1 },
    7:  { name: '铁矿',   color: '#8a7a6a', spot: '#c89464', drop: 'iron',  tier: 2 },
    8:  { name: '金矿',   color: '#8a7a40', spot: '#ffd84a', drop: 'gold',  tier: 3 },
    9:  { name: '木板',   color: '#9a6230', drop: 'planks',   tier: 1, placeable: true },
    10: { name: '工作台', color: '#a07030', drop: 'workbench', tier: 1, placeable: true },
    11: { name: '火把',   color: '#ffcc44', drop: 'torch',    placeable: true, light: true },
    12: { name: '沙子',   color: '#d8c890', drop: 'sand',     tier: 1, placeable: true }
  };

  // 物品定义
  const ITEMS = {
    pickaxe_wood:  { name: '木镐',   tool: 'pickaxe', tier: 1, stack: 1 },
    pickaxe_stone: { name: '石镐',   tool: 'pickaxe', tier: 2, stack: 1 },
    pickaxe_iron:  { name: '铁镐',   tool: 'pickaxe', tier: 3, stack: 1 },
    pickaxe_gold:  { name: '金镐',   tool: 'pickaxe', tier: 4, stack: 1 },
    sword_wood:    { name: '木剑',   tool: 'sword',   tier: 1, stack: 1, dmg: 2 },
    sword_stone:   { name: '石剑',   tool: 'sword',   tier: 2, stack: 1, dmg: 4 },
    sword_iron:    { name: '铁剑',   tool: 'sword',   tier: 3, stack: 1, dmg: 6 },
    sword_gold:    { name: '金剑',   tool: 'sword',   tier: 4, stack: 1, dmg: 9 },
    dirt:     { name: '泥土',   tile: T.DIRT,     stack: 99, placeable: true },
    grass:    { name: '草地',   tile: T.GRASS,    stack: 99, placeable: true },
    stone:    { name: '石头',   tile: T.STONE,    stack: 99, placeable: true },
    wood:     { name: '木头',   tile: T.WOOD,     stack: 99, placeable: true },
    leaves:   { name: '树叶',   tile: T.LEAVES,   stack: 99, placeable: true },
    planks:   { name: '木板',   tile: T.PLANKS,   stack: 99, placeable: true },
    workbench:{ name: '工作台', tile: T.WORKBENCH,stack: 99, placeable: true },
    torch:    { name: '火把',   tile: T.TORCH,    stack: 99, placeable: true },
    sand:     { name: '沙子',   tile: T.SAND,     stack: 99, placeable: true },
    coal:     { name: '煤',     stack: 99 },
    iron:     { name: '铁锭',   stack: 99 },
    gold:     { name: '金锭',   stack: 99 },
    stick:    { name: '木棍',   stack: 99 }
  };

  // 合成配方: out 产物, need 材料, bench 是否需要工作台(4格内)
  const RECIPES = [
    { name: '木板',   out: { id: 'planks',  n: 4 }, need: [{ id: 'wood', n: 1 }],              bench: false },
    { name: '木棍',   out: { id: 'stick',   n: 4 }, need: [{ id: 'planks', n: 2 }],            bench: false },
    { name: '工作台', out: { id: 'workbench', n: 1 }, need: [{ id: 'planks', n: 4 }],          bench: false },
    { name: '火把',   out: { id: 'torch',   n: 4 }, need: [{ id: 'stick', n: 1 }, { id: 'coal', n: 1 }], bench: false },
    { name: '木镐',   out: { id: 'pickaxe_wood',  n: 1 }, need: [{ id: 'planks', n: 3 }, { id: 'stick', n: 2 }], bench: true },
    { name: '木剑',   out: { id: 'sword_wood',    n: 1 }, need: [{ id: 'planks', n: 2 }, { id: 'stick', n: 1 }], bench: true },
    { name: '石镐',   out: { id: 'pickaxe_stone', n: 1 }, need: [{ id: 'stone', n: 3 }, { id: 'stick', n: 2 }], bench: true },
    { name: '石剑',   out: { id: 'sword_stone',   n: 1 }, need: [{ id: 'stone', n: 2 }, { id: 'stick', n: 1 }], bench: true },
    { name: '铁镐',   out: { id: 'pickaxe_iron',  n: 1 }, need: [{ id: 'iron', n: 3 }, { id: 'stick', n: 2 }], bench: true },
    { name: '铁剑',   out: { id: 'sword_iron',    n: 1 }, need: [{ id: 'iron', n: 2 }, { id: 'stick', n: 1 }], bench: true },
    { name: '金镐',   out: { id: 'pickaxe_gold',  n: 1 }, need: [{ id: 'gold', n: 3 }, { id: 'stick', n: 2 }], bench: true },
    { name: '金剑',   out: { id: 'sword_gold',    n: 1 }, need: [{ id: 'gold', n: 2 }, { id: 'stick', n: 1 }], bench: true }
  ];

  // ===================== 随机 / 噪声 =====================
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeNoise1D(seed) {
    const rng = mulberry32(seed * 2654435761 | 0);
    const N = 512;
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) buf[i] = rng();
    function at(i) { return buf[((i % N) + N) % N]; }
    function fade(t) { return t * t * (3 - 2 * t); }
    return function (x) {
      const i = Math.floor(x), f = x - i;
      return at(i) + (at(i + 1) - at(i)) * fade(f);
    };
  }
  function makeNoise2D(seed) {
    const rng = mulberry32(seed * 2654435761 | 0);
    const N = 128;
    const buf = new Float32Array(N * N);
    for (let i = 0; i < buf.length; i++) buf[i] = rng();
    function at(ix, iy) {
      ix = ((ix % N) + N) % N; iy = ((iy % N) + N) % N;
      return buf[iy * N + ix];
    }
    function fade(t) { return t * t * (3 - 2 * t); }
    return function (x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      const u = fade(fx), v = fade(fy);
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
  }

  // ===================== Game 类 =====================
  function Game(opts) {
    opts = opts || {};
    this.headless = !!opts.headless;
    this.seed = (opts.seed !== undefined ? opts.seed : (Math.random() * 1e9) | 0);
    this.W = opts.width || 256;
    this.H = opts.height || 140;
    this.viewW = opts.viewW || 800;
    this.viewH = opts.viewH || 480;

    this.keys = Object.create(null);
    this.mouse = { x: 0, y: 0, down: false, button: 0 };
    this.selected = 0;            // 快捷栏选中格 0-9
    this.time = 0;                // 累计毫秒
    this.dayLen = opts.dayLen || 120000; // 一天一夜总时长(ms)，第1阶段仅占位
    this.dayCount = 1;
    this.message = null; this.messageTime = 0;
    this.uiPick = null; this.craftCooldown = 0;

    this._initWorld();
    this._initPlayer();
    this._initInventory();

    if (!this.headless) this._initCanvas();
  }

  // ---------- 世界 ----------
  Game.prototype._initWorld = function () {
    const W = this.W, H = this.H;
    this.world = new Uint8Array(W * H);
    this.surface = new Int16Array(W);
    const rng = mulberry32(this.seed);
    this._rng = rng;
    const n1 = makeNoise1D(this.seed + 1);
    const n2 = makeNoise1D(this.seed + 2);
    const base = Math.floor(H * 0.45);
    for (let x = 0; x < W; x++) {
      const h = base
        + Math.round((n1(x * 0.06) - 0.5) * 18)
        + Math.round((n2(x * 0.18) - 0.5) * 5);
      this.surface[x] = h;
      for (let y = 0; y < H; y++) {
        if (y < h) this.setTile(x, y, T.AIR);
        else if (y === h) this.setTile(x, y, T.GRASS);
        else if (y < h + 4) this.setTile(x, y, T.DIRT);
        else this.setTile(x, y, T.STONE);
      }
    }
    // 树
    this._trees = [];
    let lastTree = -10;
    for (let x = 3; x < W - 3; x++) {
      if (x - lastTree < 4) continue;
      if (rng() < 0.07) {
        const h = this.surface[x];
        const trunk = 4 + ((rng() * 4) | 0);
        for (let k = 1; k <= trunk; k++) this.setTile(x, h - k, T.WOOD);
        const cy = h - trunk;
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 1; dy++) {
            if (dx * dx + dy * dy > 5) continue;
            if (rng() < 0.86) this.setTile(x + dx, cy + dy, T.LEAVES);
          }
        }
        this._trees.push({ x: x, base: h, top: cy });
        lastTree = x;
      }
    }
    // 洞穴 (2D 噪声掏洞, 仅在石头区)
    const caveN = makeNoise2D(this.seed + 7);
    const caveN2 = makeNoise2D(this.seed + 13);
    for (let x = 0; x < W; x++) {
      const s = this.surface[x];
      for (let y = s + 5; y < H - 1; y++) {
        if (this.getTile(x, y) !== T.STONE) continue;
        const v = caveN(x * 0.10, y * 0.10) * 0.7 + caveN2(x * 0.05, y * 0.05) * 0.3;
        if (v > 0.80) this.setTile(x, y, T.AIR);
      }
    }
    // 矿脉 (随机游走, 分层: 煤浅/铁中/金深)
    this._genOres(rng, T.COAL, 6, 30, 46, 5, 9);
    this._genOres(rng, T.IRON, 25, 60, 32, 4, 7);
    this._genOres(rng, T.GOLD, 50, 999, 20, 3, 6);
  };

  Game.prototype._genOres = function (rng, ore, minDepth, maxDepth, count, minSize, maxSize) {
    const W = this.W, H = this.H;
    for (let k = 0; k < count; k++) {
      const x = 2 + ((rng() * (W - 4)) | 0);
      const s = this.surface[x];
      const lo = Math.min(H - 2, s + minDepth);
      const hi = Math.min(H - 2, s + maxDepth);
      if (hi <= lo) continue;
      let cx = x, cy = lo + ((rng() * (hi - lo)) | 0);
      const size = minSize + ((rng() * (maxSize - minSize + 1)) | 0);
      for (let i = 0; i < size; i++) {
        if (this.getTile(cx, cy) === T.STONE) this.setTile(cx, cy, ore);
        const r = rng();
        if (r < 0.4) cx += 1; else if (r < 0.8) cx -= 1;
        const r2 = rng();
        if (r2 < 0.45) cy += 1; else if (r2 < 0.7) cy -= 1;
        if (cx < 1) cx = 1; if (cx > W - 2) cx = W - 2;
        if (cy < 1) cy = 1; if (cy > H - 2) cy = H - 2;
      }
    }
  };

  Game.prototype.idx = function (x, y) { return y * this.W + x; };
  Game.prototype.inBounds = function (x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; };
  Game.prototype.getTile = function (x, y) {
    if (!this.inBounds(x, y)) return T.STONE; // 边界视为实心
    return this.world[this.idx(x, y)];
  };
  Game.prototype.setTile = function (x, y, t) {
    if (!this.inBounds(x, y)) return false;
    this.world[this.idx(x, y)] = t;
    return true;
  };
  Game.prototype.isSolid = function (x, y) { return !!SOLID[this.getTile(x, y)]; };

  // ---------- 玩家 ----------
  Game.prototype._initPlayer = function () {
    const cx = (this.W >> 1);
    const sy = this.surface[cx];
    this.player = {
      x: cx * TILE + (TILE - 14) / 2,
      y: (sy - 3) * TILE,
      w: 14, h: 28,
      vx: 0, vy: 0,
      onGround: false,
      facing: 1,
      hp: MAX_HP, maxHp: MAX_HP,
      invuln: 0,
      coins: 0,
      miningTx: -1, miningTy: -1, miningProg: 0
    };
    this.camera = { x: 0, y: 0 };
  };

  // ---------- 背包 ----------
  Game.prototype._initInventory = function () {
    // 40 格: 0-9 快捷栏, 10-39 主背包
    this.inv = new Array(40);
    for (let i = 0; i < 40; i++) this.inv[i] = { item: null, count: 0 };
    this._addItem('pickaxe_wood', 1);
    this._addItem('sword_wood', 1);
    this._addItem('torch', 5);
  };

  Game.prototype._stackMax = function (id) { return (ITEMS[id] && ITEMS[id].stack) || 99; };

  Game.prototype._findSlot = function (id) {
    for (let i = 0; i < this.inv.length; i++) {
      if (this.inv[i].item === id && this.inv[i].count < this._stackMax(id)) return i;
    }
    for (let i = 0; i < this.inv.length; i++) {
      if (this.inv[i].item === null) return i;
    }
    return -1;
  };

  // 返回未能放入的剩余数量
  Game.prototype._addItem = function (id, count) {
    count = count || 1;
    let left = count;
    while (left > 0) {
      const s = this._findSlot(id);
      if (s < 0) return left;
      const max = this._stackMax(id);
      const can = Math.min(max - this.inv[s].count, left);
      this.inv[s].item = id;
      this.inv[s].count += can;
      left -= can;
    }
    return 0;
  };

  Game.prototype.countItem = function (id) {
    let n = 0;
    for (let i = 0; i < this.inv.length; i++) if (this.inv[i].item === id) n += this.inv[i].count;
    return n;
  };
  Game.prototype.hasItem = function (id, count) { return this.countItem(id) >= (count || 1); };

  // 从背包扣除指定数量(跨堆), 成功返回 true
  Game.prototype._removeItem = function (id, count) {
    if (this.countItem(id) < count) return false;
    let need = count;
    for (let i = 0; i < this.inv.length && need > 0; i++) {
      if (this.inv[i].item === id) {
        const take = Math.min(this.inv[i].count, need);
        this.inv[i].count -= take;
        need -= take;
        if (this.inv[i].count === 0) this.inv[i].item = null;
      }
    }
    return need === 0;
  };

  Game.prototype.selectedSlot = function () { return this.inv[this.selected]; };
  Game.prototype.selectSlot = function (i) { if (i >= 0 && i < 10) this.selected = i; };

  // ---------- 合成 ----------
  Game.prototype.setMessage = function (msg, ms) { this.message = msg; this.messageTime = ms || 2000; };
  Game.prototype.nearestWorkbenchDist = function () {
    const p = this.player;
    const px = (p.x + p.w / 2) / TILE, py = (p.y + p.h / 2) / TILE;
    let best = Infinity;
    const R = 8;
    const x0 = Math.max(0, Math.floor(px - R)), x1 = Math.min(this.W - 1, Math.ceil(px + R));
    const y0 = Math.max(0, Math.floor(py - R)), y1 = Math.min(this.H - 1, Math.ceil(py + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (this.getTile(x, y) === T.WORKBENCH) {
        const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        if (d < best) best = d;
      }
    }
    return best;
  };
  Game.prototype.nearWorkbench = function () { return this.nearestWorkbenchDist() <= 4; };

  Game.prototype.canCraft = function (idx) {
    const r = RECIPES[idx];
    if (!r) return { ok: false, reason: '未知配方' };
    for (let i = 0; i < r.need.length; i++) {
      if (!this.hasItem(r.need[i].id, r.need[i].n)) {
        return { ok: false, reason: '材料不足: ' + ITEMS[r.need[i].id].name };
      }
    }
    if (r.bench) {
      const d = this.nearestWorkbenchDist();
      if (d > 4) return { ok: false, reason: '需要靠近工作台 (当前距离 ' + d.toFixed(1) + ' 格)' };
    }
    return { ok: true, reason: '可合成' };
  };

  Game.prototype.craft = function (idx) {
    const c = this.canCraft(idx);
    if (!c.ok) { this.setMessage(c.reason); return c; }
    const r = RECIPES[idx];
    for (let i = 0; i < r.need.length; i++) this._removeItem(r.need[i].id, r.need[i].n);
    const left = this._addItem(r.out.id, r.out.n);
    this.setMessage('合成完成: ' + r.name + (left > 0 ? ' (背包满, 丢弃 ' + left + ')' : ''));
    this.craftCooldown = 300;
    return { ok: true, reason: '合成完成' };
  };
  Game.prototype.recipes = function () { return RECIPES; };

  Game.prototype.swapSlots = function (a, b) {
    if (a < 0 || b < 0 || a >= this.inv.length || b >= this.inv.length || a === b) return false;
    const t = this.inv[a]; this.inv[a] = this.inv[b]; this.inv[b] = t;
    return true;
  };

  // ---------- 输入 ----------
  Game.prototype.setKey = function (k, v) { this.keys[k] = v; };
  Game.prototype.setMouse = function (x, y, down, button) {
    this.mouse.x = x; this.mouse.y = y;
    if (down !== undefined) { this.mouse.down = down; this.mouse.button = button || 0; }
  };

  // ---------- 工具: 镐等级 ----------
  Game.prototype._pickTier = function () {
    const s = this.selectedSlot();
    if (!s || !s.item) return 0;
    const def = ITEMS[s.item];
    return (def && def.tool === 'pickaxe') ? def.tier : 0;
  };
  Game.prototype._hasSword = function () {
    const s = this.selectedSlot();
    if (!s || !s.item) return null;
    const def = ITEMS[s.item];
    return (def && def.tool === 'sword') ? def : null;
  };

  // ---------- 挖掘 / 放置 ----------
  Game.prototype._reachOk = function (tx, ty) {
    const p = this.player;
    const px = p.x + p.w / 2, py = p.y + p.h / 2;
    const dx = (tx + 0.5) * TILE - px;
    const dy = (ty + 0.5) * TILE - py;
    return Math.sqrt(dx * dx + dy * dy) <= REACH * TILE;
  };

  // 挖掘指定格子(需选中镐且等级足够且在触及范围内). 返回 true 表示成功破坏.
  Game.prototype.mineTile = function (tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    const t = this.getTile(tx, ty);
    if (t === T.AIR) return false;
    const def = TILE_DEF[t];
    if (!def) return false;
    const tier = this._pickTier();
    if (tier <= 0) return false;                 // 未选镐
    if ((def.tier || 1) > tier) return false;    // 等级不足
    if (!this._reachOk(tx, ty)) return false;
    this.setTile(tx, ty, T.AIR);
    if (def.drop) this._addItem(def.drop, 1);
    return true;
  };

  // 带反馈的挖掘尝试 (UI 用), 返回 {ok,reason}
  Game.prototype.tryMine = function (tx, ty) {
    if (!this.inBounds(tx, ty)) return { ok: false, reason: '越界' };
    const t = this.getTile(tx, ty);
    if (t === T.AIR) return { ok: false, reason: '空气' };
    const def = TILE_DEF[t];
    const tier = this._pickTier();
    if (tier <= 0) { this.setMessage('请选择镐子'); return { ok: false, reason: '未选镐' }; }
    if (!this._reachOk(tx, ty)) { this.setMessage('距离太远'); return { ok: false, reason: '距离太远' }; }
    if ((def.tier || 1) > tier) {
      const need = ['?', '木镐', '石镐', '铁镐', '金镐'][def.tier || 1];
      this.setMessage('需要 ' + need + ' 才能挖掘 ' + def.name);
      return { ok: false, reason: '等级不足' };
    }
    this.setTile(tx, ty, T.AIR);
    if (def.drop) this._addItem(def.drop, 1);
    return { ok: true, reason: 'ok' };
  };

  // 在指定空格放置当前选中方块. 返回 true 表示成功.
  Game.prototype.placeTile = function (tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    if (this.getTile(tx, ty) !== T.AIR) return false;
    if (!this._reachOk(tx, ty)) return false;
    const s = this.selectedSlot();
    if (!s || !s.item || s.count <= 0) return false;
    const def = ITEMS[s.item];
    if (!def || !def.placeable) return false;
    // 不能放置在玩家身上
    const p = this.player;
    const bx0 = p.x, bx1 = p.x + p.w, by0 = p.y, by1 = p.y + p.h;
    const tx0 = tx * TILE, ty0 = ty * TILE;
    if (tx0 < bx1 && tx0 + TILE > bx0 && ty0 < by1 && ty0 + TILE > by0) return false;
    this.setTile(tx, ty, def.tile);
    s.count -= 1;
    if (s.count <= 0) s.item = null;
    return true;
  };

  // ---------- 碰撞 ----------
  Game.prototype._moveAndCollide = function () {
    const p = this.player;
    // X 轴
    p.x += p.vx;
    {
      const top = Math.floor(p.y / TILE);
      const bot = Math.floor((p.y + p.h - 0.001) / TILE);
      if (p.vx > 0) {
        const col = Math.floor((p.x + p.w - 0.001) / TILE);
        for (let r = top; r <= bot; r++) if (this.isSolid(col, r)) { p.x = col * TILE - p.w; p.vx = 0; break; }
      } else if (p.vx < 0) {
        const col = Math.floor(p.x / TILE);
        for (let r = top; r <= bot; r++) if (this.isSolid(col, r)) { p.x = (col + 1) * TILE; p.vx = 0; break; }
      }
    }
    // Y 轴
    p.y += p.vy;
    p.onGround = false;
    {
      const left = Math.floor(p.x / TILE);
      const right = Math.floor((p.x + p.w - 0.001) / TILE);
      if (p.vy > 0) {
        const row = Math.floor((p.y + p.h - 0.001) / TILE);
        for (let c = left; c <= right; c++) if (this.isSolid(c, row)) { p.y = row * TILE - p.h; p.vy = 0; p.onGround = true; break; }
      } else if (p.vy < 0) {
        const row = Math.floor(p.y / TILE);
        for (let c = left; c <= right; c++) if (this.isSolid(c, row)) { p.y = (row + 1) * TILE; p.vy = 0; break; }
      }
    }
  };

  // ---------- 主更新 (固定 60Hz) ----------
  Game.prototype.update = function (dtMs) {
    if (dtMs === undefined) dtMs = STEP_MS;
    // 固定步长: 累加并以 STEP_MS 为单位步进, 避免大 dt 穿透
    this._acc = (this._acc || 0) + dtMs;
    let steps = 0;
    while (this._acc >= STEP_MS && steps < 8) {
      this._step();
      this._acc -= STEP_MS;
      this.time += STEP_MS;
      steps++;
    }
  };

  Game.prototype._step = function () {
    const p = this.player;
    const k = this.keys;

    // 水平输入
    let ax = 0;
    if (k['a'] || k['arrowleft']) ax -= MOVE_ACCEL;
    if (k['d'] || k['arrowright']) ax += MOVE_ACCEL;
    p.vx += ax;
    if (ax === 0) p.vx *= FRICTION;
    if (p.vx > MOVE_MAX) p.vx = MOVE_MAX;
    if (p.vx < -MOVE_MAX) p.vx = -MOVE_MAX;
    if (Math.abs(p.vx) < 0.02) p.vx = 0;
    if (p.vx > 0.01) p.facing = 1;
    else if (p.vx < -0.01) p.facing = -1;

    // 跳跃
    if ((k['w'] || k[' '] || k['space'] || k['arrowup']) && p.onGround) {
      p.vy = -JUMP_SPEED;
      p.onGround = false;
    }
    // 重力
    p.vy += GRAVITY;
    if (p.vy > 14) p.vy = 14;

    this._moveAndCollide();

    // 防止掉出世界底部
    if (p.y > this.H * TILE) { p.y = 0; p.vy = 0; }

    // 鼠标动作 (挖掘/放置/攻击)
    this._handleMouseAction();

    if (p.invuln > 0) p.invuln -= STEP_MS;
    if (this.craftCooldown > 0) this.craftCooldown -= STEP_MS;
    if (this.messageTime > 0) { this.messageTime -= STEP_MS; if (this.messageTime <= 0) this.message = null; }
  };

  Game.prototype._mouseTile = function () {
    const wx = this.mouse.x + this.camera.x;
    const wy = this.mouse.y + this.camera.y;
    return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE) };
  };

  Game.prototype._handleMouseAction = function () {
    if (this.showInv) return;                       // 背包打开时不挖掘
    if (!this.mouse.down || this.mouse.button !== 0) { this.player.miningTx = -1; return; }
    const m = this._mouseTile();
    const s = this.selectedSlot();
    if (!s || !s.item) return;
    const def = ITEMS[s.item];
    if (!def) return;
    if (def.tool === 'pickaxe') {
      this.tryMine(m.tx, m.ty);
    } else if (def.placeable) {
      this.placeTile(m.tx, m.ty);
    } else if (def.tool === 'sword') {
      // 战斗留待后续阶段
    }
  };

  // ---------- 渲染 (浏览器) ----------
  Game.prototype._initCanvas = function () {
    const c = document.getElementById('game');
    this.canvas = c;
    c.width = this.viewW; c.height = this.viewH;
    this.ctx = c.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this._bindInput();
    this._loopBound = this._loop.bind(this);
    requestAnimationFrame(this._loopBound);
  };

  Game.prototype._bindInput = function () {
    const self = this, c = this.canvas;
    window.addEventListener('keydown', function (e) {
      const key = e.key.toLowerCase();
      self.keys[key] = true;
      if (key >= '0' && key <= '9') {
        self.selectSlot(key === '0' ? 9 : parseInt(key, 10) - 1);
      }
      if (key === 'tab') { self.showInv = !self.showInv; e.preventDefault(); }
      if (key === 'e') self.showInv = !self.showInv;
      if (key === 'h') self.showHelp = !self.showHelp;
      if (key === ' ' || key === 'arrowup' || key === 'arrowdown') e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { self.keys[e.key.toLowerCase()] = false; });
    c.addEventListener('mousedown', function (e) {
      const r = c.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (c.width / r.width);
      const my = (e.clientY - r.top) * (c.height / r.height);
      self.setMouse(mx, my);
      if (self.showInv) {
        if (self._handleInvClick(mx, my)) { e.preventDefault(); return; }
      }
      self.setMouse(mx, my, true, e.button);
    });
    window.addEventListener('mouseup', function () { self.mouse.down = false; });
    c.addEventListener('mousemove', function (e) {
      const r = c.getBoundingClientRect();
      self.setMouse((e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height));
    });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      self.selectSlot((self.selected + dir + 10) % 10);
    }, { passive: false });
  };

  Game.prototype._loop = function () {
    this.update(STEP_MS);
    this.render();
    requestAnimationFrame(this._loopBound);
  };

  Game.prototype._updateCamera = function () {
    const p = this.player;
    let cx = p.x + p.w / 2 - this.viewW / 2;
    let cy = p.y + p.h / 2 - this.viewH / 2;
    cx = Math.max(0, Math.min(this.W * TILE - this.viewW, cx));
    cy = Math.max(0, Math.min(this.H * TILE - this.viewH, cy));
    this.camera.x = cx; this.camera.y = cy;
  };

  Game.prototype.render = function () {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this._updateCamera();
    // 天空
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, '#3a7bd5'); g.addColorStop(1, '#9fd0ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.viewW, this.viewH);

    const cam = this.camera;
    const x0 = Math.floor(cam.x / TILE), x1 = Math.floor((cam.x + this.viewW) / TILE) + 1;
    const y0 = Math.floor(cam.y / TILE), y1 = Math.floor((cam.y + this.viewH) / TILE) + 1;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.getTile(tx, ty);
        if (t === T.AIR) continue;
        this._drawTile(ctx, tx, ty, t);
      }
    }
    this._drawPlayer(ctx);
    this._drawCrosshair(ctx);
    this._drawHotbar(ctx);
    this._drawMessage(ctx);
    if (this.showInv) this._drawInventory(ctx);
    if (this.showHelp) this._drawHelp(ctx);
  };

  Game.prototype._drawTile = function (ctx, tx, ty, t) {
    const def = TILE_DEF[t];
    const sx = tx * TILE - this.camera.x;
    const sy = ty * TILE - this.camera.y;
    ctx.fillStyle = def.color;
    ctx.fillRect(sx, sy, TILE, TILE);
    if (def.top && this.getTile(tx, ty - 1) === T.AIR) {
      ctx.fillStyle = def.top; ctx.fillRect(sx, sy, TILE, 3);
    }
    if (def.spot) {
      ctx.fillStyle = def.spot;
      const h = (tx * 73856093 ^ ty * 19349663) >>> 0;
      ctx.fillRect(sx + 3 + (h % 5), sy + 3 + ((h >> 3) % 5), 4, 4);
      ctx.fillRect(sx + 8 + ((h >> 5) % 4), sy + 8 + ((h >> 7) % 4), 3, 3);
    }
    // 像素纹理细线
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(sx, sy + TILE - 1, TILE, 1);
    ctx.fillRect(sx + TILE - 1, sy, 1, TILE);
  };

  Game.prototype._drawPlayer = function (ctx) {
    const p = this.player;
    const sx = Math.round(p.x - this.camera.x);
    const sy = Math.round(p.y - this.camera.y);
    // 身体
    ctx.fillStyle = '#d94a4a'; ctx.fillRect(sx + 2, sy + 10, 10, 12);
    // 头
    ctx.fillStyle = '#f0c090'; ctx.fillRect(sx + 3, sy, 8, 10);
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(sx + 3, sy + 2, 8, 3); // 头发
    // 眼
    ctx.fillStyle = '#1a1a1a';
    if (p.facing > 0) { ctx.fillRect(sx + 8, sy + 6, 2, 2); ctx.fillRect(sx + 5, sy + 6, 1, 2); }
    else { ctx.fillRect(sx + 4, sy + 6, 2, 2); ctx.fillRect(sx + 9, sy + 6, 1, 2); }
    // 腿
    ctx.fillStyle = '#2a3a6a';
    ctx.fillRect(sx + 2, sy + 22, 4, 6);
    ctx.fillRect(sx + 8, sy + 22, 4, 6);
    // 手持工具
    const s = this.selectedSlot();
    if (s && s.item && ITEMS[s.item] && ITEMS[s.item].tool) {
      const isPick = ITEMS[s.item].tool === 'pickaxe';
      ctx.fillStyle = isPick ? '#caa46a' : '#dddddd';
      const hx = p.facing > 0 ? sx + 11 : sx - 2;
      ctx.fillRect(hx, sy + 11, 4, 7);
      ctx.fillStyle = '#8a5a2a'; ctx.fillRect(hx, sy + 17, 4, 2);
    }
  };

  Game.prototype._drawCrosshair = function (ctx) {
    const m = this._mouseTile();
    const sx = m.tx * TILE - this.camera.x;
    const sy = m.ty * TILE - this.camera.y;
    const ok = this._reachOk(m.tx, m.ty);
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,80,80,0.7)';
    ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
  };

  Game.prototype._drawHotbar = function (ctx) {
    const n = 10, sz = 38, gap = 4;
    const total = n * sz + (n - 1) * gap;
    let x0 = (this.viewW - total) / 2;
    const y0 = this.viewH - sz - 8;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (sz + gap);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y0, sz, sz);
      ctx.strokeStyle = i === this.selected ? '#ffe08a' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = i === this.selected ? 3 : 1;
      ctx.strokeRect(x + 0.5, y0 + 0.5, sz - 1, sz - 1);
      const s = this.inv[i];
      if (s && s.item) {
        this._drawItemIcon(ctx, s.item, x + 4, y0 + 4, sz - 8);
        if (s.count > 1) {
          ctx.fillStyle = '#fff'; ctx.font = '12px monospace';
          ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(s.count, x + sz - 3, y0 + sz - 2);
        }
      }
      // 槽位号
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(i === 9 ? '0' : String(i + 1), x + 2, y0 + 1);
    }
  };

  Game.prototype._drawItemIcon = function (ctx, id, x, y, sz) {
    const def = ITEMS[id];
    if (!def) return;
    if (def.tile !== undefined) {
      const td = TILE_DEF[def.tile];
      ctx.fillStyle = td.color; ctx.fillRect(x, y, sz, sz);
      if (td.top) { ctx.fillStyle = td.top; ctx.fillRect(x, y, sz, 4); }
      return;
    }
    if (def.tool === 'pickaxe') {
      const cols = ['#9a6230', '#888', '#c8c8c8', '#ffd84a'];
      ctx.fillStyle = '#6b4220'; ctx.fillRect(x + sz / 2 - 1, y + sz / 3, 3, sz * 2 / 3);
      ctx.fillStyle = cols[def.tier - 1] || '#888';
      ctx.fillRect(x, y, sz, 4);
      ctx.fillRect(x + sz / 2 - 3, y + 2, 6, 3);
    } else if (def.tool === 'sword') {
      const cols = ['#9a6230', '#bbb', '#ddd', '#ffe066'];
      ctx.fillStyle = cols[def.tier - 1] || '#ccc';
      ctx.fillRect(x + sz / 2 - 1, y, 3, sz * 2 / 3);
      ctx.fillStyle = '#6b4220'; ctx.fillRect(x + sz / 2 - 3, y + sz * 2 / 3, 7, 3);
    } else {
      ctx.fillStyle = '#888'; ctx.fillRect(x, y, sz, sz);
      ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(def.name.charAt(0), x + sz / 2, y + sz / 2 + 3);
    }
  };

  Game.prototype._invPanelRect = function () { return { x: 40, y: 40, w: this.viewW - 80, h: this.viewH - 80 }; };
  Game.prototype._invSlotRect = function (i) {
    const cols = 10, sz = 32, gap = 4, x0 = 56, y0 = 80;
    const col = i % cols, row = (i / cols) | 0;
    return { x: x0 + col * (sz + gap), y: y0 + row * (sz + gap), w: sz, h: sz };
  };
  Game.prototype._recipeRect = function (i) {
    const panel = this._invPanelRect();
    const x = 416, y0 = 78, rh = 28;
    return { x: x, y: y0 + i * rh, w: panel.x + panel.w - x - 16, h: rh - 4 };
  };

  Game.prototype._handleInvClick = function (mx, my) {
    const panel = this._invPanelRect();
    if (mx < panel.x || mx > panel.x + panel.w || my < panel.y || my > panel.y + panel.h) {
      this.showInv = false; return true;
    }
    for (let i = 0; i < this.inv.length; i++) {
      const r = this._invSlotRect(i);
      if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) {
        if (this.uiPick === null || this.uiPick === undefined) this.uiPick = i;
        else { this.swapSlots(this.uiPick, i); this.uiPick = null; }
        return true;
      }
    }
    for (let i = 0; i < RECIPES.length; i++) {
      const r = this._recipeRect(i);
      if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) { this.craft(i); return true; }
    }
    return true;
  };

  Game.prototype._drawInventory = function (ctx) {
    const panel = this._invPanelRect();
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.strokeStyle = 'rgba(255,224,138,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1);
    ctx.fillStyle = '#ffe08a'; ctx.font = '14px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('背包 / 合成  (E 或 Tab 关闭 · 点击格子交换 · 点击配方合成)', panel.x + 16, panel.y + 12);
    ctx.fillStyle = '#ccc'; ctx.font = '11px monospace';
    ctx.fillText('前 10 格为快捷栏, 可把主背包物品交换上来', panel.x + 16, panel.y + 30);

    for (let i = 0; i < this.inv.length; i++) {
      const r = this._invSlotRect(i);
      ctx.fillStyle = i < 10 ? 'rgba(255,224,138,0.10)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = (this.uiPick === i) ? '#ffe08a' : (i < 10 ? 'rgba(255,224,138,0.5)' : 'rgba(255,255,255,0.35)');
      ctx.lineWidth = (this.uiPick === i) ? 3 : 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      const s = this.inv[i];
      if (s && s.item) {
        this._drawItemIcon(ctx, s.item, r.x + 3, r.y + 3, r.w - 6);
        if (s.count > 1) {
          ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(s.count, r.x + r.w - 2, r.y + r.h - 1);
        }
      }
    }

    ctx.fillStyle = '#ffe08a'; ctx.font = '13px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('合成配方', 416, 58);
    const benchD = this.nearestWorkbenchDist();
    const benchOk = benchD <= 4;
    for (let i = 0; i < RECIPES.length; i++) {
      const r = RECIPES[i];
      const rr = this._recipeRect(i);
      const c = this.canCraft(i);
      ctx.fillStyle = c.ok ? 'rgba(90,180,90,0.25)' : 'rgba(180,60,60,0.18)';
      ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
      ctx.strokeStyle = c.ok ? '#7f7' : '#777'; ctx.lineWidth = 1; ctx.strokeRect(rr.x + 0.5, rr.y + 0.5, rr.w - 1, rr.h - 1);
      this._drawItemIcon(ctx, r.out.id, rr.x + 3, rr.y + 3, 18);
      ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(r.name + ' ×' + r.out.n + (r.bench ? ' [需工作台]' : ''), rr.x + 26, rr.y + 2);
      const mat = r.need.map(function (n) { return ITEMS[n.id].name + '×' + n.n; }).join('  ');
      ctx.fillStyle = '#bbb'; ctx.font = '10px monospace';
      ctx.fillText(mat, rr.x + 26, rr.y + 15);
      ctx.fillStyle = c.ok ? '#9f9' : '#f88'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
      ctx.fillText(c.ok ? '可合成' : '不可', rr.x + rr.w - 4, rr.y + 2);
    }
    ctx.fillStyle = benchOk ? '#9f9' : '#f88'; ctx.font = '11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(benchOk ? '工作台已就位 (距离 ' + benchD.toFixed(1) + ' 格)' : '附近无工作台 (高级配方不可用)', 416, panel.y + panel.h - 22);
    if (this.message) {
      ctx.fillStyle = '#ffe08a'; ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(this.message, panel.x + 16, panel.y + panel.h - 22);
    }
  };

  Game.prototype._drawMessage = function (ctx) {
    if (!this.message || this.messageTime <= 0) return;
    ctx.font = '13px monospace';
    const w = ctx.measureText(this.message).width + 16;
    const x = (this.viewW - w) / 2, y = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y, w, 22);
    ctx.fillStyle = '#ffe08a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(this.message, x + 8, y + 4);
  };

  Game.prototype._drawHelp = function (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(60, 60, this.viewW - 120, this.viewH - 120);
    ctx.fillStyle = '#ffe08a'; ctx.font = '16px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const lines = [
      '操作帮助 (H 关闭)',
      '',
      'A / D     向左 / 向右移动',
      'W / 空格  跳跃',
      '鼠标左键  选中镐→挖掘  选中方块→放置  选中剑→攻击',
      '滚轮 / 1-0 切换快捷栏格',
      'E / Tab   打开/关闭背包合成',
      'H         帮助',
      '',
      '第1阶段: 地形/树/移动/碰撞/挖掘/放置/快捷栏',
      '第2阶段: 洞穴/矿脉/合成/工作台/背包交换',
      '后续阶段: 昼夜 / 僵尸'
    ];
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 80, 80 + i * 20);
  };

  // ===================== 导出 / 自动启动 =====================
  Game.T = T; Game.TILE_DEF = TILE_DEF; Game.ITEMS = ITEMS; Game.RECIPES = RECIPES;
  Game.TILE = TILE; Game.MAX_HP = MAX_HP; Game.STEP_MS = STEP_MS;

  global.TerrariaGame = Game;
  if (typeof module !== 'undefined' && module.exports) module.exports = Game;

  // 浏览器自动启动
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { new Game({ headless: false }); });
    } else {
      new Game({ headless: false });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);