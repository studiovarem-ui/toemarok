// ============================================
// 퇴마록 - 한국 신화 뱀서라이크
// ============================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 400, H = 700;
let scale = 1, offX = 0, offY = 0;
let t = 0;

function resize() {
    const sw = window.innerWidth/W, sh = window.innerHeight/H;
    scale = Math.min(sw, sh);
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W*scale}px`;
    canvas.style.height = `${H*scale}px`;
    offX = (window.innerWidth - W*scale)/2;
    offY = (window.innerHeight - H*scale)/2;
    canvas.style.marginLeft = `${offX}px`;
    canvas.style.marginTop = `${offY}px`;
    ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

// --- Drawing Helpers ---
function px(x,y,w,h,c) { ctx.fillStyle=c; ctx.fillRect(Math.floor(x),Math.floor(y),w,h); }
function circ(cx,cy,r,c) { ctx.fillStyle=c; ctx.beginPath(); ctx.arc(Math.floor(cx),Math.floor(cy),r,0,Math.PI*2); ctx.fill(); }
function txt(text,x,y,c,s,a) { ctx.fillStyle=c||'#fff'; ctx.font=`bold ${s||10}px monospace`; ctx.textAlign=a||'center'; ctx.textBaseline='top'; ctx.fillText(text,x,y); }

// ============================================
// AUDIO SYSTEM
// ============================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudio() { if (!audioCtx) audioCtx = new AudioCtx(); }
function playSound(type) {
    ensureAudio(); if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const g = audioCtx.createGain();
    g.connect(audioCtx.destination);
    const o = audioCtx.createOscillator();
    o.connect(g);
    switch(type) {
        case 'hit':
            o.type='square'; o.frequency.value=200;
            g.gain.setValueAtTime(0.1,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.1);
            o.start(now); o.stop(now+0.1); break;
        case 'kill':
            o.type='sine'; o.frequency.value=600;
            o.frequency.exponentialRampToValueAtTime(100,now+0.15);
            g.gain.setValueAtTime(0.08,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.15);
            o.start(now); o.stop(now+0.15); break;
        case 'levelup':
            o.type='sine'; o.frequency.value=400;
            o.frequency.exponentialRampToValueAtTime(800,now+0.2);
            g.gain.setValueAtTime(0.12,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.3);
            o.start(now); o.stop(now+0.3); break;
        case 'bomb':
            o.type='sawtooth'; o.frequency.value=100;
            o.frequency.exponentialRampToValueAtTime(30,now+0.5);
            g.gain.setValueAtTime(0.15,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.5);
            o.start(now); o.stop(now+0.5); break;
        case 'pickup':
            o.type='sine'; o.frequency.value=800;
            o.frequency.exponentialRampToValueAtTime(1200,now+0.05);
            g.gain.setValueAtTime(0.05,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.08);
            o.start(now); o.stop(now+0.08); break;
        case 'boss':
            o.type='sawtooth'; o.frequency.value=60;
            g.gain.setValueAtTime(0.15,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.8);
            o.start(now); o.stop(now+0.8); break;
    }
}

// ============================================
// SAVE SYSTEM
// ============================================
let saveData = { unlocks: [true,true,false,false,false,false], bestTime: 0, bestKills: 0, totalClears: 0 };
function loadSave() { try { const d = JSON.parse(localStorage.getItem('toemarok')); if(d) saveData=d; } catch(e){} }
function writeSave() { try { localStorage.setItem('toemarok', JSON.stringify(saveData)); } catch(e){} }
loadSave();

// ============================================
// GAME STATE
// ============================================
let state = 'title'; // title, charSelect, playing, levelUp, gameOver
let selectedChar = 0;
let player, enemies, projectiles, orbs, particles, dmgNums;
let gameTime, kills, spawnTimer, bossSpawned1, bossSpawned2;
let bombCooldown, lastTime, screenFlash = 0, screenFlashColor = '#FFF';

const CHARS = [
    { name:'퇴마사', desc:'균형형', weapon:0, color:'#4466BB', draw:null, unlocked:()=>true, hp:100, spd:120, atk:1.0, range:40 },
    { name:'무녀', desc:'원거리', weapon:1, color:'#DD3333', draw:null, unlocked:()=>true, hp:80, spd:110, atk:1.1, range:50 },
    { name:'도깨비', desc:'근접', weapon:2, color:'#33AACC', draw:null, unlocked:()=>saveData.totalClears>=1, hp:120, spd:100, atk:1.3, range:30 },
    { name:'구미호', desc:'속도', weapon:3, color:'#EE5577', draw:null, unlocked:()=>saveData.totalClears>=3, hp:70, spd:160, atk:0.9, range:35 },
    { name:'장군', desc:'탱커', weapon:5, color:'#8B6914', draw:null, unlocked:()=>saveData.totalClears>=5, hp:150, spd:90, atk:1.0, range:30 },
    { name:'산신령', desc:'소환', weapon:4, color:'#228844', draw:null, unlocked:()=>saveData.bestTime>=900, hp:90, spd:100, atk:1.2, range:60 },
];

// ============================================
// WEAPON & PASSIVE DEFINITIONS
// ============================================
const WEAPONS = [
    { name:'부적', desc:'전방 투사체', type:'projectile', baseCd:0.8, color:'#FF4444' },
    { name:'신령 방울', desc:'유도 공격', type:'homing', baseCd:1.2, color:'#FFD700' },
    { name:'도깨비 방망이', desc:'회전 공격', type:'spin', baseCd:1.5, color:'#8B4513' },
    { name:'여우불', desc:'불꽃 장판', type:'zone', baseCd:2.0, color:'#FF6600' },
    { name:'천둥', desc:'낙뢰', type:'thunder', baseCd:1.8, color:'#FFDD00' },
    { name:'신궁', desc:'관통 화살', type:'pierce', baseCd:1.0, color:'#88CCFF' },
    { name:'용의 숨결', desc:'전방 화염', type:'breath', baseCd:2.5, color:'#FF4400' },
    { name:'귀살검', desc:'근접 베기', type:'slash', baseCd:0.6, color:'#AAAAFF' },
];

const PASSIVES = [
    { name:'음양오행', desc:'공격력 +15%', stat:'atk', val:0.15, evoWeapon:0 },
    { name:'구미호 가죽', desc:'이동속도 +10%', stat:'spd', val:0.10, evoWeapon:3 },
    { name:'풍백 가호', desc:'공격범위 +12%', stat:'range', val:0.12, evoWeapon:4 },
    { name:'황금', desc:'경험치 +15%', stat:'exp', val:0.15, evoWeapon:2 },
    { name:'산삼', desc:'체력 회복', stat:'regen', val:5, evoWeapon:-1 },
    { name:'여의주', desc:'쿨타임 -8%', stat:'cdr', val:0.08, evoWeapon:6 },
    { name:'도깨비감투', desc:'회피 10%', stat:'dodge', val:0.10, evoWeapon:-1 },
    { name:'삼족오 부적', desc:'크리티컬 +8%', stat:'crit', val:0.08, evoWeapon:-1 },
];

const EVOLUTIONS = [
    { weapon:0, passive:0, name:'봉인진', desc:'처치 시 범위 폭발' },
    { weapon:3, passive:1, name:'삼매화', desc:'9개 궤도 화염' },
    { weapon:4, passive:2, name:'뇌신', desc:'5체인 번개+마비' },
    { weapon:2, passive:3, name:'여의봉', desc:'3배 크기+골드' },
    { weapon:6, passive:5, name:'청룡', desc:'화면 관통 용' },
];


// ============================================
// INPUT SYSTEM
// ============================================
const keys = {};
let touchActive = false, touchStartX = 0, touchStartY = 0, touchDX = 0, touchDY = 0;
const touchArea = document.getElementById('touch-area');

document.addEventListener('keydown', e => { keys[e.key] = true; ensureAudio(); });
document.addEventListener('keyup', e => { keys[e.key] = false; });

function screenToCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) / rect.width * W,
        y: (clientY - rect.top) / rect.height * H
    };
}

touchArea.addEventListener('touchstart', e => {
    e.preventDefault(); ensureAudio();
    const t2 = e.touches[0];
    const pos = screenToCanvas(t2.clientX, t2.clientY);
    // Menu states: handle as tap
    if (state === 'title' || state === 'charSelect' || state === 'levelUp' || state === 'gameOver') {
        handleTap(pos.x, pos.y);
        return;
    }
    // Playing state: joystick drag
    touchActive = true;
    touchStartX = pos.x;
    touchStartY = pos.y;
    touchDX = 0; touchDY = 0;
}, { passive: false });

touchArea.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!touchActive) return;
    const t2 = e.touches[0];
    const pos = screenToCanvas(t2.clientX, t2.clientY);
    touchDX = pos.x - touchStartX;
    touchDY = pos.y - touchStartY;
}, { passive: false });

touchArea.addEventListener('touchend', e => {
    e.preventDefault();
    touchActive = false; touchDX = 0; touchDY = 0;
});

touchArea.addEventListener('mousedown', e => {
    ensureAudio();
});

function getInput() {
    let dx = 0, dy = 0;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
    if (keys['ArrowUp'] || keys['w'] || keys['W']) dy -= 1;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) dy += 1;
    if (touchActive && (Math.abs(touchDX) > 5 || Math.abs(touchDY) > 5)) {
        const mag = Math.sqrt(touchDX*touchDX + touchDY*touchDY);
        dx = touchDX / mag;
        dy = touchDY / mag;
    }
    const mag = Math.sqrt(dx*dx+dy*dy);
    if (mag > 0) { dx/=mag; dy/=mag; }
    return { dx, dy, bomb: keys[' '] };
}

// ============================================
// SPRITE FUNCTIONS (preserved from preview)
// ============================================
function drawExorcist(x, y, frame) {
    const f = Math.floor(frame) % 4;
    const bob = Math.sin(f * Math.PI / 2) * 1.5;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.globalAlpha = 0.2; circ(0, 18, 10, '#000'); ctx.globalAlpha = 1;
    px(-8, -2, 16, 14, '#E8E0D0');
    px(-7, -1, 14, 12, '#F5F0E5');
    px(-2, -1, 4, 12, '#D4C8B0');
    px(-7, 6, 14, 3, '#3355AA');
    px(-7, 6, 14, 1, '#4466BB');
    const legOff = Math.sin(f * Math.PI / 2) * 2;
    px(-5, 12+legOff, 4, 6, '#E8E0D0');
    px(1, 12-legOff, 4, 6, '#E8E0D0');
    px(-6, 17+legOff, 5, 3, '#2a2a2a');
    px(1, 17-legOff, 5, 3, '#2a2a2a');
    circ(0, -10, 9, '#FFD5B0');
    circ(0, -10, 8, '#FFE0C0');
    px(-3, -11, 2, 2, '#1a1a1a');
    px(2, -11, 2, 2, '#1a1a1a');
    px(-1, -8, 2, 1, '#CC8866');
    px(-10, -20, 20, 3, '#1a1a1a');
    px(-6, -24, 12, 5, '#2a2a2a');
    px(-5, -23, 10, 4, '#333333');
    px(-4, -20, 8, 1, '#444');
    const armSwing = Math.sin(f * Math.PI / 2) * 3;
    px(-11, 0+armSwing, 4, 8, '#F5F0E5');
    px(7, 0-armSwing, 4, 8, '#F5F0E5');
    px(-12, 7+armSwing, 3, 3, '#FFD5B0');
    px(8, 7-armSwing, 3, 3, '#FFD5B0');
    if (armSwing > 0) {
        px(9, 4-armSwing, 5, 7, '#FF4444');
        px(10, 5-armSwing, 3, 5, '#FFD700');
        px(10, 6-armSwing, 1, 1, '#000');
        px(12, 7-armSwing, 1, 1, '#000');
    }
    ctx.restore();
}

function drawMunyeo(x, y, frame) {
    const f = Math.floor(frame) % 4;
    const bob = Math.sin(f * Math.PI / 2) * 1.5;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.globalAlpha = 0.2; circ(0, 18, 10, '#000'); ctx.globalAlpha = 1;
    px(-9, -2, 18, 16, '#F5F0E5');
    px(-8, -1, 16, 14, '#FFFFFF');
    px(-8, 8, 16, 6, '#DD3333');
    px(-7, 9, 14, 4, '#EE4444');
    px(-2, 2, 4, 2, '#DD3333');
    px(-4, 4, 2, 6, '#DD3333');
    px(2, 4, 2, 6, '#DD3333');
    circ(0, -10, 9, '#FFD5B0');
    circ(0, -10, 8, '#FFE0C0');
    px(-4, -12, 3, 3, '#1a1a1a');
    px(2, -12, 3, 3, '#1a1a1a');
    px(-3, -11, 1, 1, '#fff');
    px(3, -11, 1, 1, '#fff');
    px(-1, -7, 2, 1, '#DD6666');
    px(-9, -18, 18, 10, '#1a1a1a');
    px(-10, -16, 2, 20, '#1a1a1a');
    px(8, -16, 2, 20, '#1a1a1a');
    circ(6, -17, 3, '#FF6688');
    circ(6, -17, 1.5, '#FFAACC');
    const armS = Math.sin(f * Math.PI / 2) * 2;
    px(-12, 0+armS, 4, 8, '#FFFFFF');
    px(8, 0-armS, 4, 8, '#FFFFFF');
    circ(-13, 6+armS, 3, '#FFD700');
    circ(-13, 6+armS, 2, '#FFEC8B');
    px(-14, 3+armS, 2, 3, '#DAA520');
    ctx.restore();
}

function drawDokkaebi(x, y, frame) {
    const f = Math.floor(frame) % 4;
    const bob = Math.sin(f * Math.PI / 2) * 2;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.globalAlpha = 0.2; circ(0, 18, 10, '#000'); ctx.globalAlpha = 1;
    px(-9, -2, 18, 16, '#2288AA');
    px(-8, -1, 16, 14, '#33AACC');
    px(-8, 8, 16, 6, '#CC8833');
    px(-6, 9, 3, 4, '#8B4513');
    px(-1, 10, 3, 3, '#8B4513');
    px(4, 9, 3, 4, '#8B4513');
    px(-6, 14+bob*0.3, 5, 5, '#2288AA');
    px(1, 14-bob*0.3, 5, 5, '#2288AA');
    px(-6, 18, 6, 3, '#1a1a1a');
    px(1, 18, 6, 3, '#1a1a1a');
    circ(0, -10, 10, '#2288AA');
    circ(0, -10, 9, '#33BBDD');
    px(-2, -22, 4, 5, '#FFD700');
    px(-1, -26, 2, 5, '#FFEC8B');
    px(0, -28, 1, 3, '#FFF8DC');
    px(-8, -18, 3, 6, '#AA3333');
    px(5, -18, 3, 6, '#AA3333');
    px(-5, -20, 2, 4, '#CC4444');
    px(3, -20, 2, 4, '#CC4444');
    px(-5, -12, 4, 3, '#FFFFFF');
    px(2, -12, 4, 3, '#FFFFFF');
    px(-4, -11, 2, 2, '#FF0000');
    px(3, -11, 2, 2, '#FF0000');
    px(-4, -7, 8, 3, '#1a1a1a');
    px(-3, -6, 2, 2, '#FFFFFF');
    px(2, -6, 2, 2, '#FFFFFF');
    px(-13, -1, 5, 10, '#33AACC');
    px(8, -1, 5, 10, '#33AACC');
    px(11, -6, 5, 16, '#8B4513');
    px(10, -8, 7, 4, '#A0522D');
    px(10, -8, 7, 2, '#CD853F');
    circ(11, -8, 2, '#888');
    circ(15, -7, 2, '#888');
    circ(13, -10, 2, '#888');
    ctx.restore();
}

function drawGumiho(x, y, frame) {
    const f = Math.floor(frame) % 4;
    const bob = Math.sin(f * Math.PI / 2) * 1;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.globalAlpha = 0.2; circ(0, 18, 10, '#000'); ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
        const angle = (i - 2) * 0.4 + Math.sin(t * 2 + i * 0.5) * 0.15;
        const tx2 = Math.sin(angle) * (12 + i * 2);
        const ty2 = 5 + Math.cos(angle) * 3;
        ctx.globalAlpha = 0.9;
        for (let j = 0; j < 4; j++) {
            const jx = tx2 * (1 + j * 0.3);
            const jy = ty2 - j * 5;
            px(jx - 2, jy, 4, 4, j < 3 ? '#FF8844' : '#FFFFFF');
        }
    }
    ctx.globalAlpha = 1;
    px(-8, -2, 16, 15, '#DD4466');
    px(-7, -1, 14, 13, '#EE5577');
    px(-7, 8, 14, 5, '#CC3355');
    px(-7, -2, 14, 1, '#FFD700');
    px(-7, 7, 14, 1, '#FFD700');
    circ(0, -10, 9, '#FFD5B0');
    circ(0, -10, 8, '#FFE0C0');
    px(-8, -22, 5, 7, '#FF8844');
    px(-7, -21, 3, 5, '#FFBB88');
    px(3, -22, 5, 7, '#FF8844');
    px(4, -21, 3, 5, '#FFBB88');
    px(-4, -12, 3, 2, '#FFD700');
    px(2, -12, 3, 2, '#FFD700');
    px(-3, -12, 1, 2, '#1a1a1a');
    px(3, -12, 1, 2, '#1a1a1a');
    px(-2, -7, 1, 1, '#CC6644');
    px(1, -7, 1, 1, '#CC6644');
    px(-1, -6, 2, 1, '#CC6644');
    px(-9, -18, 18, 8, '#1a1a1a');
    px(-10, -15, 2, 18, '#1a1a1a');
    px(8, -15, 2, 18, '#1a1a1a');
    px(-11, 0, 4, 7, '#EE5577');
    px(7, 0, 4, 7, '#EE5577');
    const flicker = Math.sin(t * 6) * 2;
    circ(-12, 5, 4+flicker*0.3, 'rgba(255,100,0,0.6)');
    circ(-12, 5, 2.5, '#FFAA44');
    circ(-12, 4, 1.5, '#FFEE88');
    ctx.restore();
}

function drawJanggun(x, y, frame) {
    const f = Math.floor(frame) % 4;
    const bob = Math.sin(f * Math.PI / 2) * 1;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.globalAlpha = 0.2; circ(0, 18, 10, '#000'); ctx.globalAlpha = 1;
    px(-10, -4, 20, 18, '#8B6914');
    px(-9, -3, 18, 16, '#A0792C');
    px(-9, -3, 18, 2, '#FFD700');
    px(-9, 5, 18, 2, '#FFD700');
    px(-6, 14, 5, 5, '#8B6914');
    px(1, 14, 5, 5, '#8B6914');
    px(-6, 18, 6, 3, '#4a4a4a');
    px(1, 18, 6, 3, '#4a4a4a');
    circ(0, -12, 10, '#FFD5B0');
    circ(0, -12, 9, '#FFE0C0');
    px(-3, -13, 2, 2, '#1a1a1a');
    px(2, -13, 2, 2, '#1a1a1a');
    px(-2, -10, 4, 1, '#1a1a1a');
    px(-10, -24, 20, 8, '#CC2222');
    px(-8, -22, 16, 5, '#DD3333');
    px(-3, -27, 6, 4, '#FFD700');
    px(-2, -26, 4, 2, '#FFEC8B');
    px(-13, -2, 5, 12, '#A0792C');
    px(8, -2, 5, 12, '#A0792C');
    px(12, -30, 3, 36, '#666');
    px(11, -32, 5, 4, '#888');
    px(10, -34, 7, 2, '#AAA');
    ctx.restore();
}

function drawSanshin(x, y, frame) {
    const f = Math.floor(frame) % 4;
    const float = Math.sin(t * 1.5) * 2;
    ctx.save(); ctx.translate(x, y + float);
    ctx.globalAlpha = 0.2; circ(0, 18, 10, '#000'); ctx.globalAlpha = 1;
    px(-9, -2, 18, 16, '#F0F0F0');
    px(-8, -1, 16, 14, '#FFFFFF');
    px(-8, 6, 16, 2, '#228844');
    px(-5, 12, 4, 6, '#F0F0F0');
    px(1, 12, 4, 6, '#F0F0F0');
    circ(0, -10, 9, '#FFD5B0');
    circ(0, -10, 8, '#FFE0C0');
    px(-3, -12, 2, 2, '#1a1a1a');
    px(2, -12, 2, 2, '#1a1a1a');
    px(-4, -6, 8, 3, '#DDDDDD');
    px(-5, -3, 10, 5, '#EEEEEE');
    px(-3, -18, 6, 6, '#DDDDDD');
    px(-2, -20, 4, 3, '#EEEEEE');
    ctx.globalAlpha = 0.3; circ(0, 0, 20, '#88FF88'); ctx.globalAlpha = 1;
    px(-12, 0, 4, 8, '#FFFFFF');
    px(8, 0, 4, 8, '#FFFFFF');
    circ(16, 10, 8, '#FF8844');
    circ(16, 10, 6, '#FFAA66');
    px(13, 7, 2, 2, '#1a1a1a');
    px(18, 7, 2, 2, '#1a1a1a');
    ctx.restore();
}


// ============================================
// ENEMY SPRITES
// ============================================
function drawJapgwi(x, y, frame) {
    const bob = Math.sin(t * 3 + x * 0.1) * 3;
    ctx.save(); ctx.translate(x, y + bob);
    circ(0, 0, 10, '#6633AA');
    circ(0, -1, 9, '#7744BB');
    for (let i = -3; i <= 3; i++) { const wy = 8 + Math.sin(t * 4 + i) * 2; px(i * 3 - 1, wy, 3, 4, '#6633AA'); }
    px(-4, -3, 3, 3, '#FFFFFF'); px(2, -3, 3, 3, '#FFFFFF');
    px(-3, -2, 2, 2, '#FF0000'); px(3, -2, 2, 2, '#FF0000');
    px(-2, 3, 4, 2, '#3a1a5a');
    ctx.restore();
}

function drawDokkaebul(x, y, frame) {
    const flick = Math.sin(t * 5 + y) * 3;
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = 0.3; circ(0, 0, 14 + flick, '#4488FF'); ctx.globalAlpha = 1;
    circ(0, 0, 8, '#3366DD'); circ(0, -1, 6, '#4488FF');
    circ(0, -2, 3, '#88CCFF'); circ(0, -3, 1.5, '#FFFFFF');
    for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1; ctx.globalAlpha = 0.6; circ(Math.sin(a)*6, Math.cos(a)*4-3, 2, '#88CCFF'); }
    ctx.globalAlpha = 1;
    px(-3, -2, 2, 2, '#1a1a4a'); px(2, -2, 2, 2, '#1a1a4a');
    ctx.restore();
}

function drawMulgwisin(x, y, frame) {
    const bob = Math.sin(t * 2) * 2;
    ctx.save(); ctx.translate(x, y + bob);
    circ(0, 0, 10, '#225544'); circ(0, -1, 9, '#336655');
    for (let i = -2; i <= 2; i++) { const drip = (t * 30 + i * 7) % 12; px(i * 4, 8 + drip, 2, 3, '#225544'); }
    for (let i = -2; i <= 2; i++) { const sw = Math.sin(t * 2 + i) * 3; px(i * 3 - 1, -14 + sw, 2, 10, '#1a4433'); }
    px(-4, -3, 3, 4, '#CCFFEE'); px(2, -3, 3, 4, '#CCFFEE');
    px(-3, -2, 1, 2, '#000'); px(3, -2, 1, 2, '#000');
    px(-3, 3, 6, 4, '#0a2a1a');
    ctx.restore();
}

function drawYacha(x, y, frame) {
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = 0.2; circ(0, 14, 8, '#000'); ctx.globalAlpha = 1;
    px(-8, -4, 16, 14, '#881122'); px(-7, -3, 14, 12, '#AA2233');
    circ(0, -11, 9, '#CC2233'); circ(0, -11, 8, '#DD3344');
    px(-7, -22, 3, 6, '#FFD700'); px(-6, -24, 2, 3, '#FFF');
    px(4, -22, 3, 6, '#FFD700'); px(5, -24, 2, 3, '#FFF');
    px(-4, -13, 3, 2, '#FFDD00'); px(2, -13, 3, 2, '#FFDD00');
    px(-3, -13, 1, 2, '#000'); px(3, -13, 1, 2, '#000');
    px(-3, -7, 2, 2, '#FFF'); px(2, -7, 2, 2, '#FFF');
    px(-11, 2, 4, 3, '#CC2233'); px(-13, 3, 2, 4, '#FFD700');
    px(7, 2, 4, 3, '#CC2233'); px(11, 3, 2, 4, '#FFD700');
    px(-5, 10, 4, 6, '#881122'); px(1, 10, 4, 6, '#881122');
    ctx.restore();
}

function drawGangsi(x, y, frame) {
    const hop = Math.abs(Math.sin(t * 2)) * 4;
    ctx.save(); ctx.translate(x, y - hop);
    ctx.globalAlpha = 0.2; circ(0, 18+hop, 10, '#000'); ctx.globalAlpha = 1;
    px(-9, -2, 18, 16, '#225566'); px(-8, -1, 16, 14, '#337788');
    px(-1, 0, 2, 2, '#FFD700'); px(-1, 4, 2, 2, '#FFD700'); px(-1, 8, 2, 2, '#FFD700');
    px(-14, -2, 6, 4, '#337788'); px(8, -2, 6, 4, '#337788');
    px(-16, -2, 3, 3, '#88AA88'); px(13, -2, 3, 3, '#88AA88');
    circ(0, -10, 9, '#88AA88'); circ(0, -10, 8, '#99BB99');
    px(-3, -17, 6, 8, '#FFDD44'); px(-2, -16, 4, 6, '#FF4444');
    px(-1, -15, 2, 1, '#000'); px(-2, -13, 4, 1, '#000'); px(-1, -11, 2, 1, '#000');
    px(-4, -11, 3, 1, '#2a4a2a'); px(2, -11, 3, 1, '#2a4a2a');
    px(-5, 14, 4, 5, '#225566'); px(1, 14, 4, 5, '#225566');
    px(-5, 18, 5, 3, '#1a1a1a'); px(1, 18, 5, 3, '#1a1a1a');
    ctx.restore();
}

function drawWongwi(x, y, frame) {
    const float = Math.sin(t * 1.5) * 5;
    ctx.save(); ctx.translate(x, y + float);
    ctx.globalAlpha = 0.7;
    px(-8, -4, 16, 20, '#CCCCDD'); px(-7, -3, 14, 18, '#DDDDEE');
    for (let i = -3; i <= 3; i++) { const tw = Math.sin(t * 2 + i) * 2; px(i*3-1, 14+tw, 3, 4, '#BBBBCC'); }
    circ(0, -12, 9, '#EEEEF5');
    px(-10, -20, 20, 14, '#1a1a1a'); px(-11, -18, 2, 22, '#1a1a1a'); px(9, -18, 2, 22, '#1a1a1a');
    px(2, -13, 2, 2, '#FF0000');
    ctx.globalAlpha = 1;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 4; i++) { const ga = t * 2 + i * 1.57; circ(Math.sin(ga)*14, Math.cos(ga)*8, 3, '#88AAFF'); }
    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawSamdugu(x, y, frame) {
    const bob = Math.sin(t * 2) * 2;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.globalAlpha = 0.2; circ(0, 14, 8, '#000'); ctx.globalAlpha = 1;
    px(-8, -2, 16, 12, '#4a2a2a'); px(-7, -1, 14, 10, '#6a3a3a');
    px(-5, 10, 4, 5, '#4a2a2a'); px(1, 10, 4, 5, '#4a2a2a');
    circ(-8, -10, 6, '#5a2a2a'); circ(-8, -10, 5, '#7a3a3a');
    px(-10, -12, 2, 2, '#FF0000'); px(-7, -12, 2, 2, '#FF0000');
    px(-9, -9, 3, 1, '#1a1a1a');
    circ(0, -12, 6, '#5a2a2a'); circ(0, -12, 5, '#7a3a3a');
    px(-2, -14, 2, 2, '#FF0000'); px(1, -14, 2, 2, '#FF0000');
    px(-1, -11, 3, 1, '#1a1a1a');
    circ(8, -10, 6, '#5a2a2a'); circ(8, -10, 5, '#7a3a3a');
    px(6, -12, 2, 2, '#FF0000'); px(9, -12, 2, 2, '#FF0000');
    px(7, -9, 3, 1, '#1a1a1a');
    ctx.restore();
}

function drawImuga(x, y, frame) {
    const wave = Math.sin(t * 2) * 3;
    ctx.save(); ctx.translate(x, y);
    for (let i = 4; i >= 0; i--) {
        const sx = Math.sin(t * 2 + i * 0.8) * (5 + i * 2);
        const sy = i * 5;
        circ(sx, sy, 6 - i * 0.5, i === 0 ? '#2a5a2a' : '#3a7a3a');
    }
    circ(Math.sin(t*2)*5, 0, 8, '#2a6a2a'); circ(Math.sin(t*2)*5, -1, 7, '#3a8a3a');
    const hx = Math.sin(t*2)*5;
    px(hx-3, -5, 2, 2, '#FFDD00'); px(hx+2, -5, 2, 2, '#FFDD00');
    px(hx-2, -8, 2, 5, '#FFD700'); px(hx+1, -8, 2, 5, '#FFD700');
    px(hx-2, -2, 5, 2, '#1a4a1a');
    ctx.restore();
}

// ============================================
// BOSS SPRITE
// ============================================
function drawGwiwang(x, y, frame) {
    const breath = Math.sin(t * 1.5) * 2;
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = 0.15;
    circ(0, 0, 35 + breath, '#FF0000'); circ(0, 0, 28 + breath, '#FF4400');
    ctx.globalAlpha = 1;
    px(-16, -8, 32, 28, '#2a0a0a'); px(-15, -7, 30, 26, '#4a1a1a'); px(-14, -6, 28, 24, '#5a2a1a');
    px(-20, -8, 8, 8, '#6a3a2a'); px(-19, -7, 6, 6, '#8a5a3a');
    px(12, -8, 8, 8, '#6a3a2a'); px(13, -7, 6, 6, '#8a5a3a');
    circ(0, -18, 14, '#3a0a0a'); circ(0, -18, 12, '#5a1a1a');
    for (let i = -2; i <= 2; i++) {
        const hh = Math.abs(i) === 2 ? 8 : i === 0 ? 14 : 10;
        px(i * 5 - 1, -32 - hh, 3, hh, '#FFD700'); px(i * 5, -32 - hh, 1, hh/2, '#FFF');
    }
    const eyeGlow = Math.sin(t * 4) * 0.3 + 0.7;
    ctx.globalAlpha = eyeGlow;
    px(-7, -21, 5, 3, '#FF4400'); px(3, -21, 5, 3, '#FF4400');
    ctx.globalAlpha = 1;
    px(-6, -20, 3, 2, '#FFDD00'); px(4, -20, 3, 2, '#FFDD00');
    px(-5, -14, 10, 3, '#1a0000');
    px(-4, -13, 2, 2, '#FFF'); px(0, -13, 2, 3, '#FFF'); px(3, -13, 2, 2, '#FFF');
    px(18, -30, 4, 40, '#4a4a4a'); px(16, -34, 8, 6, '#8a2a2a');
    px(15, -36, 10, 3, '#AA3333'); px(16, -36, 8, 1, '#FF6644');
    ctx.restore();
}

function drawGumihoKing(x, y, frame) {
    const breath = Math.sin(t * 1.2) * 3;
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = 0.1; circ(0, 0, 40+breath, '#FF4488'); ctx.globalAlpha = 1;
    for (let i = 0; i < 9; i++) {
        const angle = (i - 4) * 0.3 + Math.sin(t * 1.5 + i * 0.4) * 0.15;
        for (let j = 0; j < 5; j++) {
            const jx2 = Math.sin(angle) * (15 + j * 6);
            const jy2 = 10 - j * 6;
            ctx.globalAlpha = 0.8;
            px(jx2-3, jy2, 6, 5, j < 4 ? '#FF6644' : '#FFFFFF');
        }
    }
    ctx.globalAlpha = 1;
    px(-14, -6, 28, 22, '#AA2244'); px(-13, -5, 26, 20, '#CC3366');
    px(-13, -6, 26, 2, '#FFD700'); px(-13, 8, 26, 2, '#FFD700');
    circ(0, -16, 12, '#FFD5B0'); circ(0, -16, 11, '#FFE0C0');
    px(-10, -28, 6, 8, '#FF6644'); px(-9, -27, 4, 6, '#FFAA88');
    px(4, -28, 6, 8, '#FF6644'); px(5, -27, 4, 6, '#FFAA88');
    px(-5, -18, 4, 3, '#FFD700'); px(2, -18, 4, 3, '#FFD700');
    px(-4, -18, 1, 3, '#1a1a1a'); px(3, -18, 1, 3, '#1a1a1a');
    px(-3, -13, 6, 2, '#CC3344');
    px(-12, -4, 26, 10, '#1a1a1a');
    px(-13, -2, 2, 18, '#1a1a1a'); px(11, -2, 2, 18, '#1a1a1a');
    ctx.restore();
}

// ============================================
// WEAPON & ITEM DRAWING
// ============================================
function drawTalisman(x, y) {
    ctx.save(); ctx.translate(x, y);
    px(-3, -5, 6, 10, '#FF4444'); px(-2, -4, 4, 8, '#FFD700');
    px(-1, -3, 2, 1, '#000'); px(-2, -1, 4, 1, '#000'); px(-1, 1, 2, 1, '#000');
    ctx.globalAlpha = 0.3; circ(0, 0, 8, '#FF4444'); ctx.globalAlpha = 1;
    ctx.restore();
}

function drawBell(x, y) {
    ctx.save(); ctx.translate(x, y);
    circ(0, 0, 5, '#FFD700'); circ(0, -1, 4, '#FFEC8B'); circ(0, -2, 2, '#FFF8DC');
    px(-1, -6, 2, 3, '#DAA520');
    ctx.globalAlpha = 0.3;
    const sw = Math.sin(t * 6) * 2;
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 8+sw, -0.5, 0.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 12+sw, -0.3, 0.3); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawFoxFire(x, y) {
    ctx.save(); ctx.translate(x, y);
    const fl = Math.sin(t * 8) * 2;
    ctx.globalAlpha = 0.3; circ(0, 0, 12+fl, '#FF6600'); ctx.globalAlpha = 1;
    circ(0, 0, 6, '#FF4400'); circ(0, -1, 4, '#FF8844');
    circ(0, -2, 2.5, '#FFCC44'); circ(0, -3, 1.5, '#FFFFFF');
    ctx.restore();
}

function drawThunder(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#FFDD00';
    ctx.beginPath();
    ctx.moveTo(-3, -12); ctx.lineTo(2, -4); ctx.lineTo(-1, -4);
    ctx.lineTo(3, 6); ctx.lineTo(-2, -1); ctx.lineTo(1, -1);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.4; circ(0, -3, 10, '#FFDD00'); ctx.globalAlpha = 1;
    ctx.restore();
}

function drawExpOrb(x, y) {
    const glow = Math.sin(t * 4) * 0.3 + 0.7;
    ctx.globalAlpha = glow * 0.3; circ(x, y, 8, '#00FF88'); ctx.globalAlpha = 1;
    circ(x, y, 4, '#00CC66'); circ(x, y, 3, '#00FF88'); circ(x, y-1, 1.5, '#AAFFCC');
}

const charDrawFns = [drawExorcist, drawMunyeo, drawDokkaebi, drawGumiho, drawJanggun, drawSanshin];
const enemyDrawFns = [drawJapgwi, drawDokkaebul, drawMulgwisin, drawYacha, drawGangsi, drawWongwi, drawSamdugu, drawImuga];


// ============================================
// MAP DRAWING
// ============================================
function drawMap(camX, camY) {
    const tileW = 40, tileH = 40;
    const startX = Math.floor((camX - W/2) / tileW) - 1;
    const startY = Math.floor((camY - H/2) / tileH) - 1;
    const endX = startX + Math.ceil(W / tileW) + 3;
    const endY = startY + Math.ceil(H / tileH) + 3;
    for (let ty = startY; ty <= endY; ty++) {
        for (let tx = startX; tx <= endX; tx++) {
            const sx = tx * tileW - camX + W/2;
            const sy = ty * tileH - camY + H/2;
            const hash = ((tx * 7 + ty * 13) & 0xFF);
            const r = 140 + (hash & 15); const g = 115 + (hash & 15); const b = 85 + (hash & 7);
            px(sx, sy, tileW, tileH, `rgb(${r},${g},${b})`);
            if (hash % 17 === 0) { px(sx+10, sy+15, 3, 2, `rgb(${r-15},${g-15},${b-10})`); }
            if (hash % 23 === 0) { circ(sx+25, sy+20, 2, '#5a7a3a'); }
        }
    }
    // Map boundary markers
    const mapR = 1200;
    const edgeDist = Math.sqrt(camX*camX + camY*camY);
    if (edgeDist > mapR - 250) {
        ctx.strokeStyle = 'rgba(255,0,0,0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(W/2 - camX, H/2 - camY, mapR, 0, Math.PI*2);
        ctx.stroke();
    }
}

// ============================================
// PARTICLE SYSTEM
// ============================================
function spawnParticles(x, y, color, count, spd) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const s = (Math.random() * 0.5 + 0.5) * (spd || 60);
        particles.push({ x, y, vx: Math.cos(angle)*s, vy: Math.sin(angle)*s, life: 0.5 + Math.random()*0.3, maxLife: 0.8, color, size: 2+Math.random()*2 });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.95; p.vy *= 0.95;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles(camX, camY) {
    for (const p of particles) {
        const sx = p.x - camX + W/2, sy = p.y - camY + H/2;
        if (sx < -10 || sx > W+10 || sy < -10 || sy > H+10) continue;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        circ(sx, sy, p.size * (p.life / p.maxLife), p.color);
    }
    ctx.globalAlpha = 1;
}

// ============================================
// DAMAGE NUMBERS
// ============================================
function spawnDmgNum(x, y, val, color) {
    dmgNums.push({ x, y, val: Math.floor(val), vy: -50, life: 0.8, color: color || '#FFF' });
}

function updateDmgNums(dt) {
    for (let i = dmgNums.length - 1; i >= 0; i--) {
        const d = dmgNums[i];
        d.y += d.vy * dt; d.vy += 30 * dt; d.life -= dt;
        if (d.life <= 0) dmgNums.splice(i, 1);
    }
}

function drawDmgNums(camX, camY) {
    for (const d of dmgNums) {
        const sx = d.x - camX + W/2, sy = d.y - camY + H/2;
        ctx.globalAlpha = Math.max(0, d.life / 0.8);
        txt(String(d.val), sx, sy, d.color, 10);
    }
    ctx.globalAlpha = 1;
}

// ============================================
// GAME INITIALIZATION
// ============================================
function initGame() {
    const ch = CHARS[selectedChar];
    player = {
        x: 0, y: 0, hp: ch.hp, maxHp: ch.hp, spd: ch.spd, atk: ch.atk,
        range: ch.range, level: 1, exp: 0, expToNext: 15,
        iframes: 0, charIdx: selectedChar, frame: 0,
        weapons: [{ id: ch.weapon, level: 1, cd: 0, evolved: false }],
        passives: [],
        // computed stats
        atkMul: 1, spdMul: 1, rangeMul: 1, expMul: 1, cdrMul: 1,
        dodge: 0, crit: 0, regenTimer: 0
    };
    enemies = []; projectiles = []; orbs = []; particles = []; dmgNums = [];
    gameTime = 0; kills = 0; spawnTimer = 0;
    bossSpawned1 = false; bossSpawned2 = false;
    bombCooldown = 0; lastTime = performance.now();
    state = 'playing';
}

function computePlayerStats() {
    const p = player;
    p.atkMul = 1; p.spdMul = 1; p.rangeMul = 1; p.expMul = 1; p.cdrMul = 1;
    p.dodge = 0; p.crit = 0;
    for (const pas of p.passives) {
        const def = PASSIVES[pas.id];
        const lv = pas.level;
        switch(def.stat) {
            case 'atk': p.atkMul += def.val * lv; break;
            case 'spd': p.spdMul += def.val * lv; break;
            case 'range': p.rangeMul += def.val * lv; break;
            case 'exp': p.expMul += def.val * lv; break;
            case 'cdr': p.cdrMul = Math.max(0.3, p.cdrMul - def.val * lv); break;
            case 'dodge': p.dodge += def.val * lv; break;
            case 'crit': p.crit += def.val * lv; break;
        }
    }
}

// ============================================
// ENEMY SPAWNING
// ============================================
const ENEMY_DEFS = [
    { name:'잡귀', hp:3, spd:90, dmg:5, radius:10, exp:3, pattern:'straight', minTime:0 },
    { name:'도깨불', hp:5, spd:70, dmg:8, radius:8, exp:5, pattern:'zigzag', minTime:30 },
    { name:'물귀신', hp:8, spd:55, dmg:7, radius:10, exp:6, pattern:'aimed', minTime:90 },
    { name:'야차', hp:6, spd:140, dmg:10, radius:9, exp:8, pattern:'swooper', minTime:150 },
    { name:'강시', hp:20, spd:40, dmg:12, radius:12, exp:10, pattern:'tank', minTime:210 },
    { name:'원귀', hp:8, spd:25, dmg:6, radius:10, exp:8, pattern:'sniper', minTime:270 },
    { name:'삼두구', hp:4, spd:80, dmg:6, radius:10, exp:5, pattern:'formation', minTime:330 },
    { name:'이무기', hp:15, spd:65, dmg:10, radius:12, exp:12, pattern:'spiral', minTime:400 },
];

function spawnEnemy(typeIdx, px2, py2) {
    const def = ENEMY_DEFS[typeIdx];
    const hpScale = 1 + gameTime / 60 * 0.15;
    let sx, sy;
    if (px2 !== undefined) { sx = px2; sy = py2; }
    else {
        const angle = Math.random() * Math.PI * 2;
        const dist = 380;
        sx = player.x + Math.cos(angle) * dist;
        sy = player.y + Math.sin(angle) * dist;
    }
    enemies.push({
        x: sx, y: sy, type: typeIdx, hp: def.hp * hpScale, maxHp: def.hp * hpScale,
        spd: def.spd, dmg: def.dmg, radius: def.radius, exp: def.exp,
        pattern: def.pattern, timer: 0, phase: 0, angle: Math.random()*Math.PI*2,
        isBoss: false, shootCd: 0, startX: sx, startY: sy
    });
}

function spawnBoss(type) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 350;
    const bx = player.x + Math.cos(angle) * dist;
    const by = player.y + Math.sin(angle) * dist;
    const boss = {
        x: bx, y: by, type: type === 1 ? 98 : 99,
        hp: type === 1 ? 300 : 800, maxHp: type === 1 ? 300 : 800,
        spd: type === 1 ? 40 : 35, dmg: type === 1 ? 20 : 25,
        radius: type === 1 ? 30 : 35, exp: type === 1 ? 100 : 300,
        pattern: type === 1 ? 'boss1' : 'boss2',
        timer: 0, phase: 0, angle: 0, isBoss: true, shootCd: 0,
        startX: bx, startY: by
    };
    enemies.push(boss);
    playSound('boss');
}

function updateSpawning(dt) {
    // Much higher spawn rate: starts at 3/sec, ramps up fast
    const baseRate = 3 + gameTime / 30 * 1.5 + Math.floor(gameTime / 60) * 0.8;
    spawnTimer += dt * baseRate;
    while (spawnTimer >= 1) {
        spawnTimer -= 1;
        const available = [];
        for (let i = 0; i < ENEMY_DEFS.length; i++) {
            if (gameTime >= ENEMY_DEFS[i].minTime) available.push(i);
        }
        if (available.length > 0) {
            const weights = available.map((idx, i) => 1 + i * 0.5);
            const totalW = weights.reduce((a,b)=>a+b,0);
            let r = Math.random() * totalW;
            let chosen = available[0];
            for (let i = 0; i < weights.length; i++) {
                r -= weights[i];
                if (r <= 0) { chosen = available[i]; break; }
            }
            if (chosen === 6) {
                const ang = Math.random() * Math.PI * 2;
                for (let j = 0; j < 3; j++) {
                    const d = 380;
                    const a2 = ang + (j-1)*0.2;
                    spawnEnemy(6, player.x + Math.cos(a2)*d, player.y + Math.sin(a2)*d);
                }
            } else {
                spawnEnemy(chosen);
            }
        }
    }
    // Wave burst every 30 seconds - big swarm
    if (Math.floor(gameTime) % 30 === 0 && Math.floor(gameTime) !== Math.floor(gameTime - dt)) {
        const burstCount = 8 + Math.floor(gameTime / 30) * 3;
        for (let i = 0; i < burstCount; i++) {
            const a = (i / burstCount) * Math.PI * 2;
            spawnEnemy(0, player.x + Math.cos(a)*400, player.y + Math.sin(a)*400);
        }
    }
    // Cap max enemies for performance
    while (enemies.length > 200) { enemies.shift(); }
    // Boss spawns
    if (gameTime >= 450 && !bossSpawned1) { bossSpawned1 = true; spawnBoss(1); }
    if (gameTime >= 900 && !bossSpawned2) { bossSpawned2 = true; spawnBoss(2); }
}


// ============================================
// ENEMY AI UPDATE
// ============================================
function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dx = player.x - e.x, dy = player.y - e.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const nx = dx/dist, ny = dy/dist;
        e.timer += dt;

        switch(e.pattern) {
            case 'straight':
                e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
                break;
            case 'zigzag':
                const zig = Math.sin(e.timer * 4) * 40;
                e.x += (nx * e.spd + Math.cos(e.angle + Math.PI/2) * zig) * dt;
                e.y += (ny * e.spd + Math.sin(e.angle + Math.PI/2) * zig) * dt;
                e.angle = Math.atan2(dy, dx);
                break;
            case 'aimed':
                e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
                break;
            case 'swooper':
                if (e.phase === 0) { // approach
                    e.x += nx * e.spd * 0.3 * dt; e.y += ny * e.spd * 0.3 * dt;
                    if (dist < 150) { e.phase = 1; e.timer = 0; }
                } else if (e.phase === 1) { // charge!
                    e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
                    if (e.timer > 0.8) { e.phase = 2; e.timer = 0; }
                } else { // retreat
                    e.x -= nx * e.spd * 0.5 * dt; e.y -= ny * e.spd * 0.5 * dt;
                    if (e.timer > 1.5) e.phase = 0;
                }
                break;
            case 'tank':
                e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
                break;
            case 'sniper':
                e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
                e.shootCd -= dt;
                if (e.shootCd <= 0 && dist < 300) {
                    e.shootCd = 2.5;
                    projectiles.push({ x: e.x, y: e.y, vx: nx*120, vy: ny*120, dmg: e.dmg, life: 3, radius: 4, enemy: true, color: '#FF4488' });
                }
                break;
            case 'formation':
                e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
                break;
            case 'spiral':
                e.angle += 1.5 * dt;
                const spiralR = Math.max(30, dist - 20 * dt);
                e.x = player.x + Math.cos(e.angle) * spiralR;
                e.y = player.y + Math.sin(e.angle) * spiralR;
                break;
            case 'boss1': // 귀왕
                e.shootCd -= dt;
                if (e.phase === 0) { // chase
                    e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
                    if (e.timer > 4) { e.phase = 1; e.timer = 0; }
                } else if (e.phase === 1) { // charge
                    e.x += nx * e.spd * 3 * dt; e.y += ny * e.spd * 3 * dt;
                    if (e.timer > 1) { e.phase = 2; e.timer = 0; }
                } else { // summon + explode
                    if (e.timer < 0.1) {
                        spawnParticles(e.x, e.y, '#FF4400', 15, 80);
                        // area dmg
                        if (dist < 80) { damagePlayer(15); }
                        // summon
                        for (let s = 0; s < 3; s++) spawnEnemy(0, e.x + (Math.random()-0.5)*60, e.y + (Math.random()-0.5)*60);
                    }
                    if (e.timer > 2) { e.phase = 0; e.timer = 0; }
                }
                break;
            case 'boss2': // 구미호왕
                e.shootCd -= dt;
                if (e.phase === 0) { // orbit
                    e.angle += 0.8 * dt;
                    const orb = 180;
                    e.x = player.x + Math.cos(e.angle) * orb;
                    e.y = player.y + Math.sin(e.angle) * orb;
                    if (e.shootCd <= 0) {
                        e.shootCd = 1.5;
                        projectiles.push({ x: e.x, y: e.y, vx: nx*100, vy: ny*100, dmg: e.dmg, life: 4, radius: 6, enemy: true, color: '#FF6644', homing: true });
                    }
                    if (e.timer > 6) { e.phase = 1; e.timer = 0; }
                } else { // fox fire field
                    e.x += nx * e.spd * 0.5 * dt; e.y += ny * e.spd * 0.5 * dt;
                    if (e.timer < 0.1) {
                        for (let f = 0; f < 5; f++) {
                            const fa = Math.random() * Math.PI * 2;
                            const fd = 50 + Math.random() * 100;
                            projectiles.push({ x: e.x + Math.cos(fa)*fd, y: e.y + Math.sin(fa)*fd, vx:0, vy:0, dmg:8, life:3, radius:15, enemy:true, color:'#FF4400', zone:true });
                        }
                    }
                    if (e.timer > 4) { e.phase = 0; e.timer = 0; }
                }
                break;
        }

        // Clamp to map
        const mapR = 1200;
        const eDist = Math.sqrt(e.x*e.x + e.y*e.y);
        if (eDist > mapR) { e.x *= mapR/eDist; e.y *= mapR/eDist; }

        // Collision with player
        if (dist < e.radius + 10) {
            damagePlayer(e.dmg);
        }

        // Remove if too far
        const pd = Math.sqrt((e.x-player.x)**2 + (e.y-player.y)**2);
        if (pd > 800 && !e.isBoss) { enemies.splice(i, 1); }
    }
}

function damagePlayer(dmg) {
    if (player.iframes > 0) return;
    if (Math.random() < player.dodge) { spawnDmgNum(player.x, player.y-20, 0, '#88FFFF'); return; }
    player.hp -= dmg;
    player.iframes = 0.5;
    screenFlash = 0.15; screenFlashColor = '#FF0000';
    spawnDmgNum(player.x, player.y - 20, dmg, '#FF4444');
    spawnParticles(player.x, player.y, '#FF4444', 8, 50);
    playSound('hit');
    if (player.hp <= 0) {
        player.hp = 0;
        state = 'gameOver';
        // save
        if (gameTime > saveData.bestTime) saveData.bestTime = gameTime;
        if (kills > saveData.bestKills) saveData.bestKills = kills;
        writeSave();
    }
}

function killEnemy(idx) {
    const e = enemies[idx];
    const col = e.isBoss ? '#FFD700' : enemyColor(e.type);
    // Big death explosion
    spawnParticles(e.x, e.y, col, 15, 80);
    spawnParticles(e.x, e.y, '#FFFFFF', 5, 50);
    // Screen flash for bosses
    if (e.isBoss) { screenFlash = 0.3; screenFlashColor = '#FFD700'; }
    playSound('kill');
    kills++;
    // Drop exp orbs (multiple for tough enemies)
    const expVal = e.exp * player.expMul;
    const orbCount = e.isBoss ? 8 : (e.exp >= 8 ? 3 : 1);
    for (let oi = 0; oi < orbCount; oi++) {
        orbs.push({ x: e.x + (Math.random()-0.5)*20, y: e.y + (Math.random()-0.5)*20, val: expVal/orbCount, life: 15 });
    }
    enemies.splice(idx, 1);
    if (e.type === 99) { saveData.totalClears++; writeSave(); }
}

function enemyColor(type) {
    const colors = ['#7744BB','#4488FF','#336655','#DD3344','#337788','#CCCCDD','#7a3a3a','#3a8a3a'];
    if (type === 98) return '#FF4400';
    if (type === 99) return '#FF4488';
    return colors[type] || '#888';
}


// ============================================
// WEAPON SYSTEM
// ============================================
function fireWeapons(dt) {
    for (const w of player.weapons) {
        const def = WEAPONS[w.id];
        const cd = def.baseCd * player.cdrMul / (1 + (w.level - 1) * 0.1);
        w.cd -= dt;
        if (w.cd > 0) continue;
        w.cd = cd;

        const baseDmg = (5 + w.level * 3) * player.atkMul;
        const isCrit = Math.random() < player.crit;
        const dmg = isCrit ? baseDmg * 2 : baseDmg;
        const critColor = isCrit ? '#FFDD00' : null;

        // Find nearest enemy for targeting
        let nearDist = Infinity, nearEnemy = null;
        for (const e of enemies) {
            const d = Math.sqrt((e.x-player.x)**2 + (e.y-player.y)**2);
            if (d < nearDist) { nearDist = d; nearEnemy = e; }
        }
        let aimX = 0, aimY = -1;
        if (nearEnemy) {
            const adx = nearEnemy.x - player.x, ady = nearEnemy.y - player.y;
            const ad = Math.sqrt(adx*adx+ady*ady) || 1;
            aimX = adx/ad; aimY = ady/ad;
        }

        switch(def.type) {
            case 'projectile': { // 부적
                const count = w.evolved ? 7 : w.level;
                const spread = 0.15;
                for (let i = 0; i < count; i++) {
                    const ang = Math.atan2(aimY, aimX) + (i - (count-1)/2) * spread;
                    projectiles.push({ x: player.x, y: player.y, vx: Math.cos(ang)*220, vy: Math.sin(ang)*220, dmg, life: 1.5, radius: 8, enemy: false, color: w.evolved ? '#AA44FF' : '#FF4444', critColor, evolved: w.evolved });
                }
                break;
            }
            case 'homing': { // 신령 방울
                const count = Math.min(w.level, 3);
                let targets = [...enemies].sort((a,b) => {
                    const da = (a.x-player.x)**2+(a.y-player.y)**2;
                    const db = (b.x-player.x)**2+(b.y-player.y)**2;
                    return da - db;
                }).slice(0, count);
                for (const tgt of targets) {
                    const adx = tgt.x - player.x, ady = tgt.y - player.y;
                    const ad2 = Math.sqrt(adx*adx+ady*ady)||1;
                    projectiles.push({ x: player.x, y: player.y, vx: adx/ad2*160, vy: ady/ad2*160, dmg, life: 2, radius: 7, enemy: false, color: '#FFD700', homing: true, target: tgt, critColor });
                }
                if (targets.length === 0 && nearEnemy) {
                    projectiles.push({ x: player.x, y: player.y, vx: aimX*160, vy: aimY*160, dmg, life: 2, radius: 7, enemy: false, color: '#FFD700', critColor });
                }
                break;
            }
            case 'spin': { // 도깨비 방망이
                const range = (40 + w.level * 10) * player.rangeMul;
                const arcAngle = w.evolved ? Math.PI * 2 : (Math.PI * (0.5 + w.level * 0.15));
                const startAng = Math.atan2(aimY, aimX) - arcAngle / 2;
                for (const e of enemies) {
                    const edx = e.x - player.x, edy = e.y - player.y;
                    const ed = Math.sqrt(edx*edx + edy*edy);
                    if (ed > range) continue;
                    const ea = Math.atan2(edy, edx);
                    let diff = ea - startAng;
                    while (diff < -Math.PI) diff += Math.PI*2;
                    while (diff > Math.PI) diff -= Math.PI*2;
                    if (diff >= 0 && diff <= arcAngle) {
                        const d = w.evolved ? dmg * 1.5 : dmg;
                        e.hp -= d;
                        spawnDmgNum(e.x, e.y - 10, d, critColor || '#8B4513');
                        if (w.evolved || w.level >= 4) {
                            const kbStr = 30;
                            e.x += (edx/ed) * kbStr; e.y += (edy/ed) * kbStr;
                        }
                    }
                }
                // Visual
                spawnParticles(player.x + aimX*20, player.y + aimY*20, '#8B4513', 3, 30);
                break;
            }
            case 'zone': { // 여우불
                const count = w.evolved ? 9 : Math.min(1 + Math.floor(w.level/2), 3);
                const zoneR = (15 + w.level * 5) * player.rangeMul;
                if (w.evolved) {
                    for (let i = 0; i < 9; i++) {
                        const a = t * 1.5 + i * (Math.PI*2/9);
                        const zx = player.x + Math.cos(a) * 60;
                        const zy = player.y + Math.sin(a) * 60;
                        projectiles.push({ x: zx, y: zy, vx:0, vy:0, dmg: dmg*0.6, life: cd * 0.9, radius: zoneR, enemy: false, color: '#FF4400', zone: true, critColor });
                    }
                } else {
                    for (let i = 0; i < count; i++) {
                        const zx = player.x + (Math.random()-0.5)*100;
                        const zy = player.y + (Math.random()-0.5)*100;
                        projectiles.push({ x: zx, y: zy, vx:0, vy:0, dmg: dmg*0.5, life: cd * 0.9, radius: zoneR, enemy: false, color: '#FF6600', zone: true, critColor });
                    }
                }
                break;
            }
            case 'thunder': { // 천둥
                const count = w.evolved ? 5 : Math.min(w.level, 3);
                let targets2 = [...enemies].sort(() => Math.random()-0.5).slice(0, count);
                let lastX = player.x, lastY = player.y;
                for (const tgt of targets2) {
                    tgt.hp -= dmg;
                    spawnDmgNum(tgt.x, tgt.y - 10, dmg, critColor || '#FFDD00');
                    spawnParticles(tgt.x, tgt.y, '#FFDD00', 5, 50);
                    if (w.evolved) { tgt.spd *= 0.5; setTimeout(() => { if(tgt) tgt.spd *= 2; }, 1500); }
                    lastX = tgt.x; lastY = tgt.y;
                }
                break;
            }
            case 'pierce': { // 신궁
                const count = w.evolved ? 3 : Math.min(w.level, 3);
                const spread2 = 0.1;
                for (let i = 0; i < count; i++) {
                    const ang2 = Math.atan2(aimY, aimX) + (i - (count-1)/2) * spread2;
                    projectiles.push({ x: player.x, y: player.y, vx: Math.cos(ang2)*300, vy: Math.sin(ang2)*300, dmg, life: 2, radius: 6, enemy: false, color: '#88CCFF', pierce: w.level >= 5 ? 999 : w.level, critColor });
                }
                break;
            }
            case 'breath': { // 용의 숨결
                const range2 = (60 + w.level * 15) * player.rangeMul;
                const arcAngle2 = (0.3 + w.level * 0.1) * player.rangeMul;
                const baseAng = Math.atan2(aimY, aimX);
                if (w.evolved) {
                    // 청룡 - dragon projectile across screen
                    projectiles.push({ x: player.x, y: player.y, vx: aimX*250, vy: aimY*250, dmg: dmg*3, life: 3, radius: 20, enemy: false, color: '#00AAFF', pierce: 999, critColor });
                    spawnParticles(player.x, player.y, '#00AAFF', 10, 80);
                } else {
                    for (const e of enemies) {
                        const edx2 = e.x - player.x, edy2 = e.y - player.y;
                        const ed2 = Math.sqrt(edx2*edx2 + edy2*edy2);
                        if (ed2 > range2) continue;
                        const ea2 = Math.atan2(edy2, edx2);
                        let diff2 = ea2 - baseAng;
                        while(diff2<-Math.PI) diff2+=Math.PI*2;
                        while(diff2>Math.PI) diff2-=Math.PI*2;
                        if (Math.abs(diff2) <= arcAngle2) {
                            e.hp -= dmg * 0.7;
                            spawnDmgNum(e.x, e.y-10, dmg*0.7, critColor || '#FF4400');
                            if (w.level >= 3) { e.burnTimer = 2; e.burnDmg = dmg * 0.2; }
                        }
                    }
                    spawnParticles(player.x + aimX*30, player.y + aimY*30, '#FF4400', 5, 40);
                }
                break;
            }
            case 'slash': { // 귀살검
                const range3 = (35 + w.level * 8) * player.rangeMul;
                // Front slash
                for (const e of enemies) {
                    const edx3 = e.x - player.x, edy3 = e.y - player.y;
                    const ed3 = Math.sqrt(edx3*edx3 + edy3*edy3);
                    if (ed3 > range3) continue;
                    const ea3 = Math.atan2(edy3, edx3);
                    const baseA = Math.atan2(aimY, aimX);
                    let diff3 = ea3 - baseA;
                    while(diff3<-Math.PI) diff3+=Math.PI*2;
                    while(diff3>Math.PI) diff3-=Math.PI*2;
                    if (Math.abs(diff3) <= Math.PI/2) {
                        e.hp -= dmg;
                        spawnDmgNum(e.x, e.y-10, dmg, critColor || '#AAAAFF');
                    }
                    // Back slash at lv5
                    if (w.level >= 5 && Math.abs(diff3) > Math.PI/2) {
                        e.hp -= dmg * 0.6;
                        spawnDmgNum(e.x, e.y-10, dmg*0.6, critColor || '#8888CC');
                    }
                }
                spawnParticles(player.x + aimX*15, player.y + aimY*15, '#AAAAFF', 4, 35);
                break;
            }
        }
    }
}


// ============================================
// PROJECTILE UPDATE
// ============================================
function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life -= dt;
        if (p.life <= 0) { projectiles.splice(i, 1); continue; }

        if (p.zone) {
            // Zone damage tick
            if (!p.enemy) {
                for (let j = enemies.length - 1; j >= 0; j--) {
                    const e = enemies[j];
                    const d = Math.sqrt((e.x-p.x)**2+(e.y-p.y)**2);
                    if (d < p.radius + e.radius) {
                        if (!p._tick) p._tick = {};
                        if (!p._tick[j] || p._tick[j] < t - 0.3) {
                            p._tick[j] = t;
                            e.hp -= p.dmg;
                            spawnDmgNum(e.x, e.y-10, p.dmg, p.critColor || p.color);
                        }
                    }
                }
            } else {
                const d = Math.sqrt((player.x-p.x)**2+(player.y-p.y)**2);
                if (d < p.radius + 10) damagePlayer(p.dmg * dt);
            }
            continue;
        }

        // Homing
        if (p.homing && p.target && !p.enemy) {
            const tdx = p.target.x - p.x, tdy = p.target.y - p.y;
            const td = Math.sqrt(tdx*tdx+tdy*tdy) || 1;
            p.vx += tdx/td * 400 * dt; p.vy += tdy/td * 400 * dt;
            const spd = Math.sqrt(p.vx*p.vx+p.vy*p.vy);
            if (spd > 200) { p.vx = p.vx/spd*200; p.vy = p.vy/spd*200; }
        }
        if (p.homing && p.enemy) {
            const tdx2 = player.x - p.x, tdy2 = player.y - p.y;
            const td2 = Math.sqrt(tdx2*tdx2+tdy2*tdy2) || 1;
            p.vx += tdx2/td2 * 200 * dt; p.vy += tdy2/td2 * 200 * dt;
        }

        p.x += p.vx * dt; p.y += p.vy * dt;

        if (p.enemy) {
            const d = Math.sqrt((player.x-p.x)**2+(player.y-p.y)**2);
            if (d < p.radius + 10) {
                damagePlayer(p.dmg);
                projectiles.splice(i, 1);
            }
        } else {
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                const d = Math.sqrt((e.x-p.x)**2+(e.y-p.y)**2);
                if (d < p.radius + e.radius) {
                    e.hp -= p.dmg;
                    e.hitFlash = 0.15;
                    spawnDmgNum(e.x, e.y - 10, p.dmg, p.critColor || p.color);
                    spawnParticles(e.x, e.y, p.color, 3, 30);
                    if (p.evolved) { // 봉인진 - kill explosion
                        if (e.hp <= 0) {
                            for (const e2 of enemies) {
                                const dd = Math.sqrt((e2.x-e.x)**2+(e2.y-e.y)**2);
                                if (dd < 50 && e2 !== e) {
                                    e2.hp -= p.dmg * 0.5;
                                    spawnDmgNum(e2.x, e2.y-10, p.dmg*0.5, '#AA44FF');
                                }
                            }
                            spawnParticles(e.x, e.y, '#AA44FF', 8, 50);
                        }
                    }
                    if (p.pierce) { p.pierce--; if (p.pierce <= 0) { projectiles.splice(i, 1); break; } }
                    else { projectiles.splice(i, 1); break; }
                }
            }
        }
    }
    // Check dead enemies
    for (let j = enemies.length - 1; j >= 0; j--) {
        if (enemies[j].hp <= 0) killEnemy(j);
    }
}

// ============================================
// EXP/ORB SYSTEM
// ============================================
function updateOrbs(dt) {
    for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        o.life -= dt;
        if (o.life <= 0) { orbs.splice(i, 1); continue; }
        const dx = player.x - o.x, dy = player.y - o.y;
        const d = Math.sqrt(dx*dx+dy*dy);
        const pickupR = player.range * player.rangeMul;
        if (d < pickupR) {
            const spd = 300;
            o.x += (dx/d) * spd * dt; o.y += (dy/d) * spd * dt;
        }
        if (d < 12) {
            player.exp += o.val;
            playSound('pickup');
            orbs.splice(i, 1);
            if (player.exp >= player.expToNext) {
                player.exp -= player.expToNext;
                player.level++;
                player.expToNext = player.level * 10 + Math.pow(player.level, 1.5) * 5;
                playSound('levelup');
                spawnParticles(player.x, player.y, '#FFD700', 15, 60);
                showLevelUp();
            }
        }
    }
}

// ============================================
// LEVEL UP SYSTEM
// ============================================
let levelUpChoices = [];

function showLevelUp() {
    state = 'levelUp';
    levelUpChoices = [];
    const pool = [];

    // Add weapons player has (level up) or new weapons
    for (let i = 0; i < WEAPONS.length; i++) {
        const owned = player.weapons.find(w => w.id === i);
        if (owned && owned.level < 5 && !owned.evolved) {
            pool.push({ type: 'weapon', id: i, level: owned.level + 1, name: WEAPONS[i].name, desc: `Lv${owned.level+1} ${WEAPONS[i].desc}` });
        } else if (!owned && player.weapons.length < 6) {
            pool.push({ type: 'weapon', id: i, level: 1, name: WEAPONS[i].name, desc: WEAPONS[i].desc });
        }
    }
    // Passives
    for (let i = 0; i < PASSIVES.length; i++) {
        const owned = player.passives.find(p => p.id === i);
        if (owned && owned.level < 5) {
            pool.push({ type: 'passive', id: i, level: owned.level + 1, name: PASSIVES[i].name, desc: `Lv${owned.level+1} ${PASSIVES[i].desc}` });
        } else if (!owned) {
            pool.push({ type: 'passive', id: i, level: 1, name: PASSIVES[i].name, desc: PASSIVES[i].desc });
        }
    }
    // Check evolutions
    for (const evo of EVOLUTIONS) {
        const wep = player.weapons.find(w => w.id === evo.weapon && w.level >= 5 && !w.evolved);
        const pas = player.passives.find(p => p.id === evo.passive);
        if (wep && pas) {
            pool.push({ type: 'evolution', weaponId: evo.weapon, name: evo.name, desc: `진화! ${evo.desc}`, evo: true });
        }
    }

    // Shuffle and pick 3
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    // Prioritize evolutions
    pool.sort((a,b) => (b.evo?1:0) - (a.evo?1:0));
    levelUpChoices = pool.slice(0, 3);
    if (levelUpChoices.length === 0) {
        // HP restore fallback
        levelUpChoices = [{ type: 'heal', name: '체력 회복', desc: 'HP +30', level: 0 }];
    }
}

function selectChoice(idx) {
    if (idx >= levelUpChoices.length) return;
    const choice = levelUpChoices[idx];
    if (choice.type === 'weapon') {
        const owned = player.weapons.find(w => w.id === choice.id);
        if (owned) owned.level = choice.level;
        else player.weapons.push({ id: choice.id, level: 1, cd: 0, evolved: false });
    } else if (choice.type === 'passive') {
        const owned = player.passives.find(p => p.id === choice.id);
        if (owned) owned.level = choice.level;
        else player.passives.push({ id: choice.id, level: 1 });
    } else if (choice.type === 'evolution') {
        const wep = player.weapons.find(w => w.id === choice.weaponId);
        if (wep) { wep.evolved = true; wep.level = 6; }
        spawnParticles(player.x, player.y, '#FFD700', 20, 80);
        spawnParticles(player.x, player.y, '#FFFFFF', 15, 60);
    } else if (choice.type === 'heal') {
        player.hp = Math.min(player.maxHp, player.hp + 30);
    }
    computePlayerStats();
    state = 'playing';
}

// Unified tap handler (works for both click and touch)
function handleTap(cx, cy) {
    if (state === 'title') { state = 'charSelect'; return; }

    if (state === 'charSelect') {
        for (let i = 0; i < 6; i++) {
            const col = i % 3, row = Math.floor(i / 3);
            const bx = 40 + col * 120, by = 70 + row * 230, bw = 100, bh = 200;
            if (cx >= bx && cx <= bx+bw && cy >= by && cy <= by+bh) {
                if (CHARS[i].unlocked()) { selectedChar = i; }
            }
        }
        if (cx >= 100 && cx <= 300 && cy >= 580 && cy <= 620) {
            if (CHARS[selectedChar].unlocked()) initGame();
        }
        return;
    }

    if (state === 'levelUp') {
        const cardW = 110, cardH = 160, startX2 = (W - levelUpChoices.length * cardW - (levelUpChoices.length-1)*10) / 2;
        for (let i = 0; i < levelUpChoices.length; i++) {
            const bx = startX2 + i * (cardW + 10);
            const by2 = 250;
            if (cx >= bx && cx <= bx+cardW && cy >= by2 && cy <= by2+cardH) {
                selectChoice(i);
                return;
            }
        }
        return;
    }

    if (state === 'gameOver') {
        if (cx >= 80 && cx <= 200 && cy >= 500 && cy <= 540) { initGame(); return; }
        if (cx >= 220 && cx <= 340 && cy >= 500 && cy <= 540) { state = 'title'; return; }
    }
}

// Mouse click
touchArea.addEventListener('click', e => {
    const pos = screenToCanvas(e.clientX, e.clientY);
    handleTap(pos.x, pos.y);
});

// Keyboard for level-up
document.addEventListener('keydown', e2 => {
    if (state === 'levelUp') {
        if (e2.key === '1') selectChoice(0);
        if (e2.key === '2') selectChoice(1);
        if (e2.key === '3') selectChoice(2);
    }
    if (state === 'title' && (e2.key === 'Enter' || e2.key === ' ')) { state = 'charSelect'; }
    if (state === 'gameOver' && e2.key === 'Enter') { initGame(); }
});


// ============================================
// MAIN UPDATE
// ============================================
function update(dt) {
    gameTime += dt;
    player.iframes = Math.max(0, player.iframes - dt);
    bombCooldown = Math.max(0, bombCooldown - dt);
    screenFlash = Math.max(0, screenFlash - dt * 2);
    for (const e of enemies) { if (e.hitFlash) e.hitFlash = Math.max(0, e.hitFlash - dt * 8); }

    // Regen (산삼)
    const regenPas = player.passives.find(p => p.id === 4);
    if (regenPas) {
        player.regenTimer += dt;
        if (player.regenTimer >= 30 / regenPas.level) {
            player.regenTimer = 0;
            player.hp = Math.min(player.maxHp, player.hp + PASSIVES[4].val);
        }
    }

    // Burn ticks on enemies
    for (const e of enemies) {
        if (e.burnTimer && e.burnTimer > 0) {
            e.burnTimer -= dt;
            e.hp -= (e.burnDmg || 1) * dt;
            if (Math.random() < 0.1) spawnParticles(e.x, e.y, '#FF4400', 1, 15);
        }
    }

    // Input
    const input = getInput();
    const spd = player.spd * player.spdMul;
    player.x += input.dx * spd * dt;
    player.y += input.dy * spd * dt;
    if (input.dx !== 0 || input.dy !== 0) player.frame += dt * 6;

    // Bomb
    if (input.bomb && bombCooldown <= 0) {
        bombCooldown = 30;
        playSound('bomb');
        screenFlash = 0.5; screenFlashColor = '#FFD700';
        spawnParticles(player.x, player.y, '#FFD700', 30, 120);
        for (const e of enemies) {
            if (!e.isBoss) { e.hp -= 50; spawnDmgNum(e.x, e.y-10, 50, '#FFD700'); }
            else { e.hp -= 25; spawnDmgNum(e.x, e.y-10, 25, '#FFD700'); }
        }
    }

    // Map boundary
    const mapR = 1200;
    const pDist = Math.sqrt(player.x*player.x+player.y*player.y);
    if (pDist > mapR) { player.x *= mapR/pDist; player.y *= mapR/pDist; }

    updateSpawning(dt);
    updateEnemies(dt);
    fireWeapons(dt);
    updateProjectiles(dt);
    updateOrbs(dt);
    updateParticles(dt);
    updateDmgNums(dt);
}

// ============================================
// DRAW FUNCTIONS
// ============================================
function drawGame() {
    const camX = player.x, camY = player.y;

    // Map
    drawMap(camX, camY);

    // Orbs
    for (const o of orbs) {
        const sx = o.x - camX + W/2, sy = o.y - camY + H/2;
        if (sx < -10 || sx > W+10 || sy < -10 || sy > H+10) continue;
        drawExpOrb(sx, sy);
    }

    // Projectiles - fancy rendering
    for (const p of projectiles) {
        const sx = p.x - camX + W/2, sy = p.y - camY + H/2;
        if (sx < -30 || sx > W+30 || sy < -30 || sy > H+30) continue;
        if (p.zone) {
            // Pulsing zone with inner ring
            const pulse = Math.sin(t * 6) * 0.1 + 0.9;
            ctx.globalAlpha = 0.15;
            circ(sx, sy, p.radius * pulse, p.color);
            ctx.globalAlpha = 0.35;
            circ(sx, sy, p.radius * 0.6 * pulse, p.color);
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = p.color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(sx, sy, p.radius * pulse, 0, Math.PI*2); ctx.stroke();
            ctx.globalAlpha = 1;
        } else if (p.color === '#FF4444' || p.color === '#AA44FF') {
            // 부적 - spinning talisman card
            ctx.save(); ctx.translate(sx, sy);
            const rot = Math.atan2(p.vy, p.vx);
            ctx.rotate(rot);
            // Card shape
            px(-4, -6, 8, 12, p.color);
            px(-3, -5, 6, 10, '#FFD700');
            // Symbols
            px(-1, -3, 2, 1, '#000'); px(-2, -1, 4, 1, '#000'); px(-1, 1, 2, 1, '#000');
            // Trail glow
            ctx.globalAlpha = 0.4;
            circ(-8, 0, 5, p.color);
            ctx.globalAlpha = 0.2;
            circ(-14, 0, 4, p.color);
            ctx.globalAlpha = 1;
            ctx.restore();
        } else if (p.color === '#FFD700' && p.homing) {
            // 방울 - golden bell with sound waves
            ctx.save(); ctx.translate(sx, sy);
            circ(0, 0, 5, '#FFD700');
            circ(0, -1, 3, '#FFEC8B');
            circ(0, -2, 1.5, '#FFF');
            // Sound wave rings
            const wave = (t * 8) % 1;
            ctx.globalAlpha = 1 - wave;
            ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(0, 0, 6 + wave * 12, 0, Math.PI*2); ctx.stroke();
            ctx.globalAlpha = 0.5 * (1 - wave);
            ctx.beginPath(); ctx.arc(0, 0, 10 + wave * 12, 0, Math.PI*2); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.restore();
        } else if (p.color === '#FF6600' || p.color === '#FF4400') {
            // 여우불 / 용 숨결 - flickering fire
            const fl = Math.sin(t * 12 + sx) * 2;
            ctx.globalAlpha = 0.25; circ(sx, sy, p.radius * 2.5 + fl, '#FF4400'); ctx.globalAlpha = 1;
            circ(sx, sy, p.radius + 2, '#FF4400');
            circ(sx, sy, p.radius, '#FF8844');
            circ(sx, sy, p.radius * 0.6, '#FFCC44');
            circ(sx, sy, p.radius * 0.3, '#FFFFFF');
            // Ember particles
            for (let j = 0; j < 2; j++) {
                const ea = t * 5 + j * 3 + sx * 0.1;
                ctx.globalAlpha = 0.5;
                circ(sx + Math.sin(ea)*5, sy + Math.cos(ea)*5 - 3, 1.5, '#FFAA00');
            }
            ctx.globalAlpha = 1;
        } else if (p.color === '#FFDD00') {
            // 천둥 - lightning bolt flash
            ctx.save(); ctx.translate(sx, sy);
            ctx.globalAlpha = 0.3; circ(0, 0, 15, '#FFDD00'); ctx.globalAlpha = 1;
            ctx.fillStyle = '#FFDD00';
            ctx.beginPath();
            ctx.moveTo(-3, -8); ctx.lineTo(1, -2); ctx.lineTo(-1, -2);
            ctx.lineTo(3, 5); ctx.lineTo(-1, 0); ctx.lineTo(1, 0);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.moveTo(-1, -5); ctx.lineTo(1, -1); ctx.lineTo(0, -1); ctx.lineTo(2, 3);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        } else if (p.color === '#88CCFF') {
            // 신궁 - arrow with speed lines
            ctx.save(); ctx.translate(sx, sy);
            const rot2 = Math.atan2(p.vy, p.vx);
            ctx.rotate(rot2);
            // Arrow body
            ctx.fillStyle = '#88CCFF';
            ctx.beginPath();
            ctx.moveTo(8, 0); ctx.lineTo(-4, -3); ctx.lineTo(-2, 0); ctx.lineTo(-4, 3);
            ctx.closePath(); ctx.fill();
            // Speed lines
            ctx.globalAlpha = 0.4;
            px(-12, -1, 8, 1, '#88CCFF');
            ctx.globalAlpha = 0.2;
            px(-18, 1, 6, 1, '#88CCFF');
            ctx.globalAlpha = 1;
            ctx.restore();
        } else if (p.color === '#00AAFF') {
            // 청룡 (evolved dragon breath) - big blue dragon
            ctx.save(); ctx.translate(sx, sy);
            const rot3 = Math.atan2(p.vy, p.vx);
            ctx.rotate(rot3);
            ctx.globalAlpha = 0.2; circ(0, 0, p.radius*2, '#00AAFF'); ctx.globalAlpha = 1;
            circ(8, 0, p.radius*0.8, '#00AAFF');
            circ(3, 0, p.radius, '#0088DD');
            circ(-3, 0, p.radius*0.8, '#0066BB');
            px(12, -3, 3, 2, '#FFDD00'); px(12, 1, 3, 2, '#FFDD00'); // eyes
            ctx.restore();
        } else if (p.color === '#AAAAFF') {
            // 귀살검 - slash arc
            ctx.save(); ctx.translate(sx, sy);
            const rot4 = Math.atan2(p.vy, p.vx);
            ctx.rotate(rot4);
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = '#CCCCFF'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, 12, -0.8, 0.8); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(0, 0, 12, -0.5, 0.5); ctx.stroke();
            ctx.restore();
        } else if (p.enemy && p.color === '#FF4488') {
            // Enemy sniper shot - spinning shard
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 8);
            px(-3, -3, 6, 6, '#FF4488');
            px(-2, -2, 4, 4, '#FF88AA');
            ctx.restore();
        } else {
            // Default - glowing orb with trail
            ctx.globalAlpha = 0.3; circ(sx, sy, p.radius * 2, p.color); ctx.globalAlpha = 1;
            circ(sx, sy, p.radius, p.color);
            circ(sx, sy, p.radius * 0.5, '#FFF');
        }
    }

    // Enemies
    for (const e of enemies) {
        const sx = e.x - camX + W/2, sy = e.y - camY + H/2;
        if (sx < -40 || sx > W+40 || sy < -50 || sy > H+50) continue;
        // Hit flash
        if (e.hitFlash && e.hitFlash > 0) {
            ctx.globalAlpha = 0.7;
            circ(sx, sy, e.radius + 3, '#FFF');
            ctx.globalAlpha = 1;
        }
        if (e.isBoss) {
            if (e.type === 98) drawGwiwang(sx, sy, t*3);
            else drawGumihoKing(sx, sy, t*3);
            // Boss HP bar - big
            const bhw = 80, bhh = 6;
            px(sx-bhw/2, sy-50, bhw, bhh, '#111');
            px(sx-bhw/2+1, sy-49, (bhw-2)*(e.hp/e.maxHp), bhh-2, '#FF2222');
            px(sx-bhw/2+1, sy-49, (bhw-2)*(e.hp/e.maxHp), 1, '#FF6666');
        } else {
            const drawFn2 = enemyDrawFns[e.type];
            if (drawFn2) drawFn2(sx, sy, t*3);
            // Small HP bar for damaged enemies
            if (e.hp < e.maxHp) {
                const hw = 16, hh = 2;
                px(sx-hw/2, sy-e.radius-6, hw, hh, '#333');
                px(sx-hw/2, sy-e.radius-6, hw*(e.hp/e.maxHp), hh, '#FF4444');
            }
        }
    }

    // Player
    const psx = W/2, psy = H/2;
    if (player.iframes > 0 && Math.floor(t*15)%2===0) ctx.globalAlpha = 0.3;
    const drawFn = charDrawFns[player.charIdx];
    if (drawFn) drawFn(psx, psy, player.frame);
    ctx.globalAlpha = 1;

    // Particles
    drawParticles(camX, camY);
    drawDmgNums(camX, camY);

    // === HUD ===
    // Timer
    const mins = Math.floor(gameTime/60), secs = Math.floor(gameTime%60);
    txt(`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`, 50, 8, '#FFD700', 14, 'left');
    // Kills
    txt(`💀 ${kills}`, W-10, 8, '#FF8888', 11, 'right');
    // HP bar
    const hpW = 100, hpH = 8;
    px(10, H-45, hpW+2, hpH+2, '#333');
    px(11, H-44, hpW * (player.hp/player.maxHp), hpH, player.hp/player.maxHp > 0.3 ? '#44DD44' : '#DD4444');
    txt(`Lv.${player.level}`, 10, H-60, '#FFD700', 9, 'left');
    txt(`HP ${Math.ceil(player.hp)}/${player.maxHp}`, 115, H-46, '#FFF', 7, 'left');
    // EXP bar
    const expW = W - 20;
    px(10, H-25, expW, 6, '#222');
    px(10, H-25, expW * (player.exp/player.expToNext), 6, '#00CC88');
    // Bomb
    if (bombCooldown > 0) {
        txt(`부적폭탄 ${Math.ceil(bombCooldown)}s`, W-10, H-60, '#888', 8, 'right');
    } else {
        txt('부적폭탄 [SPACE]', W-10, H-60, '#FFD700', 8, 'right');
    }
    // Weapon icons
    const iconY = H - 85;
    for (let i = 0; i < player.weapons.length; i++) {
        const w = player.weapons[i];
        const ix = 15 + i * 28;
        px(ix-10, iconY-10, 22, 22, '#222');
        px(ix-9, iconY-9, 20, 20, w.evolved ? '#442266' : '#333');
        txt(WEAPONS[w.id].name[0], ix, iconY-8, WEAPONS[w.id].color, 10);
        txt(`${w.level}`, ix, iconY+5, '#888', 7);
    }
    // Kill counter combo flash
    txt(`${enemies.length} 요괴`, W/2, 8, '#666', 8);
    // Screen flash effect
    if (screenFlash > 0) {
        ctx.globalAlpha = screenFlash;
        ctx.fillStyle = screenFlashColor;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
    }
}

function drawTitleScreen() {
    // BG
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a0505'); bg.addColorStop(0.5, '#2a0a0a'); bg.addColorStop(1, '#0a0505');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Floating ghosts
    for (let i = 0; i < 8; i++) {
        const gx = (t * 20 + i * 60) % (W + 40) - 20;
        const gy = 200 + Math.sin(t + i * 2) * 80;
        ctx.globalAlpha = 0.15;
        circ(gx, gy, 12, '#7744BB');
        ctx.globalAlpha = 1;
    }

    // Title
    txt('퇴', W/2 - 60, 180, '#FF4444', 48);
    txt('마', W/2 - 10, 180, '#FF6644', 48);
    txt('록', W/2 + 40, 180, '#FF8844', 48);
    txt('TOEMAROK', W/2, 240, '#886644', 12);
    txt('한국 신화 뱀서라이크', W/2, 260, '#AA8866', 10);

    // Prompt
    const alpha = Math.sin(t * 3) * 0.3 + 0.7;
    ctx.globalAlpha = alpha;
    txt('터치하여 시작 / Press Any Key', W/2, 400, '#FFD700', 11);
    ctx.globalAlpha = 1;

    txt('v1.0', W/2, H-30, '#444', 8);
}

function drawCharSelect() {
    ctx.fillStyle = '#1a0a0a'; ctx.fillRect(0, 0, W, H);
    txt('캐릭터 선택', W/2, 20, '#FFD700', 16);

    for (let i = 0; i < 6; i++) {
        const col = i % 3, row = Math.floor(i / 3);
        const bx = 40 + col * 120, by = 70 + row * 230;
        const ch = CHARS[i];
        const unlocked = ch.unlocked();
        const selected = i === selectedChar;

        // Card bg
        px(bx, by, 100, 200, selected ? '#443322' : '#222');
        px(bx+1, by+1, 98, 198, selected ? '#553322' : '#2a2a2a');
        if (selected) { ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, 100, 200); }

        if (unlocked) {
            // Draw character
            const drawFn = charDrawFns[i];
            if (drawFn) drawFn(bx+50, by+70, t*3);
            txt(ch.name, bx+50, by+110, '#FFF', 10);
            txt(ch.desc, bx+50, by+125, '#AAA', 8);
            txt(`HP:${ch.hp}`, bx+50, by+142, '#88FF88', 7);
            txt(`SPD:${ch.spd}`, bx+50, by+155, '#88BBFF', 7);
            txt(`ATK:${(ch.atk*100).toFixed(0)}%`, bx+50, by+168, '#FF8888', 7);
        } else {
            ctx.globalAlpha = 0.5;
            txt('🔒', bx+50, by+60, '#888', 20);
            txt(ch.name, bx+50, by+110, '#666', 10);
            ctx.globalAlpha = 1;
            txt('???', bx+50, by+140, '#555', 8);
        }
    }

    // Start button
    const btnSel = CHARS[selectedChar].unlocked();
    px(100, 580, 200, 40, btnSel ? '#DD4444' : '#444');
    txt(btnSel ? '시작하기' : '해금 필요', W/2, 588, btnSel ? '#FFF' : '#888', 14);
}

function drawLevelUp() {
    drawGame();
    // Overlay
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
    txt('⬆ 레벨 업! ⬆', W/2, 180, '#FFD700', 16);
    txt(`Lv.${player.level}`, W/2, 210, '#FFD700', 12);

    const cardW = 110, cardH = 160;
    const startX2 = (W - levelUpChoices.length * cardW - (levelUpChoices.length-1)*10) / 2;
    for (let i = 0; i < levelUpChoices.length; i++) {
        const c = levelUpChoices[i];
        const cx2 = startX2 + i * (cardW + 10);
        const cy2 = 250;

        px(cx2, cy2, cardW, cardH, c.evo ? '#442266' : '#333');
        px(cx2+2, cy2+2, cardW-4, cardH-4, c.evo ? '#553377' : '#3a3a3a');

        // Color
        let col = '#FFF';
        if (c.type === 'weapon') col = WEAPONS[c.id].color;
        if (c.type === 'passive') col = '#88FF88';
        if (c.type === 'evolution') col = '#FFD700';

        txt(`[${i+1}]`, cx2+cardW/2, cy2+8, '#888', 8);
        txt(c.name, cx2+cardW/2, cy2+30, col, 11);
        if (c.level) txt(`Lv.${c.level}`, cx2+cardW/2, cy2+50, '#AAA', 9);

        // Wrap desc
        const desc = c.desc;
        const maxW = cardW - 10;
        let lines = [];
        let line = '';
        for (const ch2 of desc) {
            if (ctx.measureText(line + ch2).width > maxW - 5) { lines.push(line); line = ch2; }
            else line += ch2;
        }
        if (line) lines.push(line);
        ctx.font = 'bold 8px monospace';
        for (let l = 0; l < lines.length; l++) {
            txt(lines[l], cx2+cardW/2, cy2+70+l*12, '#CCC', 8);
        }

        if (c.type === 'weapon') {
            // mini weapon draw
            const wx2 = cx2 + cardW/2, wy2 = cy2 + cardH - 30;
            circ(wx2, wy2, 6, WEAPONS[c.id].color);
        }
    }
}

function drawGameOver() {
    ctx.fillStyle = '#1a0a0a'; ctx.fillRect(0, 0, W, H);
    txt('게임 오버', W/2, 120, '#FF4444', 24);

    const mins = Math.floor(gameTime/60), secs = Math.floor(gameTime%60);
    txt('생존 시간', W/2, 220, '#AAA', 10);
    txt(`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`, W/2, 240, '#FFD700', 20);

    txt('처치 수', W/2, 300, '#AAA', 10);
    txt(`${kills}`, W/2, 320, '#FF8888', 20);

    txt('레벨', W/2, 380, '#AAA', 10);
    txt(`${player.level}`, W/2, 400, '#88FF88', 20);

    // Best
    txt(`최고 기록: ${Math.floor(saveData.bestTime/60)}분 ${Math.floor(saveData.bestTime%60)}초`, W/2, 450, '#666', 8);

    // Buttons
    px(80, 500, 120, 40, '#DD4444');
    txt('다시하기', 140, 508, '#FFF', 12);
    px(220, 500, 120, 40, '#444');
    txt('메뉴', 280, 508, '#FFF', 12);
}


// ============================================
// MAIN GAME LOOP
// ============================================
function gameLoop(now) {
    requestAnimationFrame(gameLoop);
    const dt = Math.min((now - (lastTime || now)) / 1000, 0.05);
    lastTime = now;
    t += dt;

    ctx.clearRect(0, 0, W, H);

    switch(state) {
        case 'title':
            drawTitleScreen();
            break;
        case 'charSelect':
            drawCharSelect();
            break;
        case 'playing':
            update(dt);
            drawGame();
            break;
        case 'levelUp':
            drawLevelUp();
            break;
        case 'gameOver':
            drawGameOver();
            break;
    }
}

lastTime = performance.now();
requestAnimationFrame(gameLoop);
