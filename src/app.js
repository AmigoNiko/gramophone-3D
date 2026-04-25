/* =====================================================================
   GRAMOPHONE — main 3D app (classic script, uses CDN THREE globals).
   Exposes a small integration API on window.GRAMOPHONE so the ESM
   modules (auth / youtube / remote-shelf) can swap the shelf contents
   when the user signs in or out.
   ===================================================================== */
(function(){
  'use strict';

  /* --------------------------- GLOBAL STATE --------------------------- */
  const state = {
    // The gramophone boots "cold" — user must open the lid and tap the
    // real power button to bring it online. Playback, notes, and the
    // on-screen volume slider are all gated behind isPowered.
    isPowered: false,
    isPlaying: false,
    currentSpeed: 0,
    targetSpeed: 0,
    speedMode: 33,
    tonearmRestRotY: 0,
    tonearmRestPosY: 0,
    tonearmTargetRotY: 0,
    tonearmTargetPosY: 0,
    tonearmPose: 'rest',
    tonearmLocked: false,
    accentTarget: 0,
    ledIntensity: 0,
    hoveredMesh: null,
    currentDisk: null,
    currentTrackIndex: 0,
    volume: 75,
    ytReady: false,
    ytFailed: false,
    isModelLoaded: false,
    lastInteraction: performance.now(),
    isLidOpen: false,
  };

  /* ----------------------------- DISKS ------------------------------ */
  const builtInDisks = [
    {
      id:"midnight-jazz", title:"Midnight Jazz", artist:"John Coltrane",
      labelColor:"#1a1a2e",
      tracks:[
        { videoId:"XMbvcp480Y4", title:"In a Sentimental Mood", thumbnail:"https://i.ytimg.com/vi/XMbvcp480Y4/hqdefault.jpg" }
      ]
    },
    {
      id:"soul-sessions", title:"Soul Sessions", artist:"Various Artists",
      labelColor:"#8B1A1A",
      tracks:[
        { videoId:"6FOUqQt3Kg0", title:"Respect — Aretha Franklin", thumbnail:"https://i.ytimg.com/vi/6FOUqQt3Kg0/hqdefault.jpg" },
        { videoId:"COiIC3A0ROM", title:"Let's Stay Together — Al Green", thumbnail:"https://i.ytimg.com/vi/COiIC3A0ROM/hqdefault.jpg" },
        { videoId:"x6QZn9xiuOE", title:"Let's Get It On — Marvin Gaye", thumbnail:"https://i.ytimg.com/vi/x6QZn9xiuOE/hqdefault.jpg" },
        { videoId:"SZKAIqBs38s", title:"(Sittin' On) The Dock of the Bay", thumbnail:"https://i.ytimg.com/vi/SZKAIqBs38s/hqdefault.jpg" }
      ]
    },
    {
      id:"electronic-pulse", title:"Electronic Pulse", artist:"Modern Dance Floor",
      labelColor:"#0d3b2e",
      tracks:[
        { videoId:"5NV6Rdv1a3I", title:"Get Lucky — Daft Punk", thumbnail:"https://i.ytimg.com/vi/5NV6Rdv1a3I/hqdefault.jpg" },
        { videoId:"tcGVfmcniyM", title:"D.A.N.C.E. — Justice", thumbnail:"https://i.ytimg.com/vi/tcGVfmcniyM/hqdefault.jpg" },
        { videoId:"tKi9Z-f6qX4", title:"Strobe — deadmau5", thumbnail:"https://i.ytimg.com/vi/tKi9Z-f6qX4/hqdefault.jpg" }
      ]
    },
    {
      id:"classical-evening", title:"Classical Evening", artist:"Claude Debussy",
      labelColor:"#2c1810",
      tracks:[
        { videoId:"CvFH_6DNRCY", title:"Clair de Lune", thumbnail:"https://i.ytimg.com/vi/CvFH_6DNRCY/hqdefault.jpg" }
      ]
    },
    {
      id:"vintage-hits", title:"Vintage Hits", artist:"Golden Era",
      labelColor:"#1a0a2e",
      tracks:[
        { videoId:"ZEcqHA7dbwM", title:"Fly Me to the Moon — Sinatra", thumbnail:"https://i.ytimg.com/vi/ZEcqHA7dbwM/hqdefault.jpg" },
        { videoId:"S-cbOl96RFM", title:"At Last — Etta James", thumbnail:"https://i.ytimg.com/vi/S-cbOl96RFM/hqdefault.jpg" },
        { videoId:"bjWxYUpOasg", title:"Unforgettable — Nat King Cole", thumbnail:"https://i.ytimg.com/vi/bjWxYUpOasg/hqdefault.jpg" },
        { videoId:"F_6hi6PTtWQ", title:"That's Amore — Dean Martin", thumbnail:"https://i.ytimg.com/vi/F_6hi6PTtWQ/hqdefault.jpg" },
        { videoId:"XZVPZkPKc3g", title:"Summertime — Billie Holiday", thumbnail:"https://i.ytimg.com/vi/XZVPZkPKc3g/hqdefault.jpg" },
        { videoId:"U16Xg_rQZkA", title:"Dream a Little Dream — Ella", thumbnail:"https://i.ytimg.com/vi/U16Xg_rQZkA/hqdefault.jpg" }
      ]
    },
    {
      id:"sunday-morning", title:"Sunday Morning", artist:"Easy Listening",
      labelColor:"#1a2a1a",
      tracks:[
        { videoId:"lbjZPFBD6JU", title:"Come Away With Me — Norah Jones", thumbnail:"https://i.ytimg.com/vi/lbjZPFBD6JU/hqdefault.jpg" },
        { videoId:"S2TeAoJqdPE", title:"Sunday Morning — Maroon 5", thumbnail:"https://i.ytimg.com/vi/S2TeAoJqdPE/hqdefault.jpg" }
      ]
    }
  ];
  let disks = [...builtInDisks];

  function loadCustomDisks(){
    try{
      const raw = localStorage.getItem("gramophone_custom_disks");
      if(!raw) return;
      const arr = JSON.parse(raw);
      if(Array.isArray(arr)) disks = [...disks, ...arr];
    }catch(e){}
  }
  function persistCustomDisks(){
    try{
      const custom = disks.filter(d => d.custom);
      localStorage.setItem("gramophone_custom_disks", JSON.stringify(custom));
    }catch(e){}
  }
  loadCustomDisks();

  /* --- First-time power-button tutorial hint --- */
  // A big 3D arrow + glowing "POWER BUTTON" label hovers above the real
  // power button the first time the lid is fully opened. The very first
  // click on the power button dismisses it forever (persisted in
  // localStorage) — so returning users never see it again.
  const POWER_HINT_STORAGE_KEY = 'gramophone_power_hint_dismissed';
  let powerHintDismissed = false;
  try{
    powerHintDismissed = localStorage.getItem(POWER_HINT_STORAGE_KEY) === '1';
  }catch(e){ /* localStorage disabled — hint will show every session, harmless */ }
  let powerHintGroup = null;            // THREE.Group anchored above the power button
  let powerHintVisibleOpacity = 0;      // current fade level, drives opacity of every piece
  function dismissPowerHint(){
    if(powerHintDismissed) return;
    powerHintDismissed = true;
    try{ localStorage.setItem(POWER_HINT_STORAGE_KEY, '1'); }catch(e){}
  }

  /* ================================================================
     THREE.JS SCENE
     ================================================================ */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0d0d0d");
  scene.fog = new THREE.Fog("#0d0d0d", 14, 30);

  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth/window.innerHeight, 0.1, 100);
  // Camera now sits on the FRONT of the model (negative Z) so the user
  // lands on the face of the gramophone — the buttons, tonearm, and
  // platter — instead of staring at the back of the chassis.
  camera.position.set(0, 1.8, -5.5);
  camera.lookAt(0, 0.3, 0);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.3, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 2.5;
  controls.maxDistance = 10;
  controls.minPolarAngle = THREE.MathUtils.degToRad(20);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(105);
  // Auto-rotate disabled on load — we want the first-time visitor to
  // see the front of the gramophone steady while they orient themselves.
  // (The idle timer in animate() no longer re-enables it.)
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.5;

  /* ---------------------------- LIGHTING ---------------------------- */
  const keyLight = new THREE.PointLight("#FFD580", 1.5, 30, 2);
  keyLight.position.set(-3, 5, 3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024,1024);
  keyLight.shadow.radius = 8;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const fillLight = new THREE.PointLight("#8ab4f8", 0.3, 20, 2);
  fillLight.position.set(4, 2, -3);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight("#1a1208", 0.5);
  scene.add(ambient);

  const rim = new THREE.DirectionalLight("#ffffff", 0.2);
  rim.position.set(0, 3, -5);
  scene.add(rim);

  const accentLight = new THREE.PointLight("#FF9A3C", 0, 8, 2);
  accentLight.position.set(0, 1.3, 0.2);
  scene.add(accentLight);

  /* ========================== CANVAS TEXTURES ========================== */

  function generateLeatherTexture(){
    const c = document.createElement("canvas"); c.width=c.height=512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#5C1010"; ctx.fillRect(0,0,512,512);
    for(let i=0;i<2400;i++){
      const x = Math.random()*512, y = Math.random()*512;
      const r = 1 + Math.random()*3;
      const shade = Math.random() < 0.5;
      ctx.fillStyle = shade ? `rgba(30,4,4,${0.15+Math.random()*0.35})` : `rgba(130,30,30,${0.1+Math.random()*0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r*(0.6+Math.random()*0.6), Math.random()*6.28, 0, Math.PI*2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2,2);
    return tex;
  }

  function generateVinylGrooveTexture(){
    const c = document.createElement("canvas"); c.width=c.height=512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0,0,512,512);
    const cx=256, cy=256;
    for(let i=0;i<90;i++){
      ctx.strokeStyle = i%2===0 ? "#111111" : "#0d0d0d";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 40 + i*2.5, 0, Math.PI*2);
      ctx.stroke();
    }
    const grd = ctx.createRadialGradient(cx,cy, 40, cx,cy, 240);
    for(let i=0;i<=1.0001;i+=0.125){
      grd.addColorStop(i, `hsla(${i*360},70%,55%,0.06)`);
    }
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,512,512);
    ctx.globalCompositeOperation = "source-over";

    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(cx,cy,8,0,Math.PI*2); ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  const labelCanvas = document.createElement("canvas"); labelCanvas.width=labelCanvas.height=256;
  const labelCtx = labelCanvas.getContext("2d");
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.anisotropy = 4;

  function isColorLight(hex){
    const m = /^#?([0-9a-f]{6})$/i.exec(hex||"");
    if(!m) return false;
    const n = parseInt(m[1],16);
    const r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    return (0.299*r+0.587*g+0.114*b) > 150;
  }

  function drawRecordLabel(track, trackIndex, totalTracks, labelColor){
    const ctx = labelCtx, w=256, h=256, cx=w/2, cy=h/2;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = labelColor || "#6B1212";
    ctx.beginPath(); ctx.arc(cx,cy, 116, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx,cy, 114, 0, Math.PI*2); ctx.stroke();

    if(track && track._thumbImg && track._thumbImg.complete && track._thumbImg.naturalWidth){
      ctx.save();
      ctx.beginPath(); ctx.arc(cx,cy, 78, 0, Math.PI*2); ctx.clip();
      const img = track._thumbImg;
      const ar = img.naturalWidth/img.naturalHeight;
      let dw, dh;
      if(ar > 1){ dh = 160; dw = 160*ar; }
      else { dw = 160; dh = 160/ar; }
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, cx-dw/2, cy-dh/2, dw, dh);
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.arc(cx,cy, 78, 0, Math.PI*2); ctx.clip();
      ctx.fillStyle = (labelColor||"#6B1212") + "99";
      ctx.fillRect(0,0,w,h);
      ctx.restore();
    } else if(track){
      const g = ctx.createRadialGradient(cx,cy,10,cx,cy,78);
      g.addColorStop(0, "#fff2");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx,cy, 78, 0, Math.PI*2); ctx.fill();
    }

    const textColor = isColorLight(labelColor) ? "#101010" : "#FAF3E0";
    const accent   = isColorLight(labelColor) ? "#6B1212" : "#E8B93F";

    ctx.fillStyle = textColor;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";

    const titleText = (track?.title || "").toUpperCase();
    ctx.font = "600 11px 'DM Mono', monospace";
    const words = titleText.split(" ");
    let line1="", line2="";
    for(const w0 of words){
      const trial = line1 ? line1+" "+w0 : w0;
      if(ctx.measureText(trial).width <= 150) line1 = trial;
      else {
        const trial2 = line2 ? line2+" "+w0 : w0;
        if(ctx.measureText(trial2).width <= 150) line2 = trial2;
      }
    }
    ctx.fillText(line1, cx, cy - 10);
    if(line2) ctx.fillText(line2, cx, cy + 4);

    if(totalTracks > 1){
      ctx.fillStyle = accent;
      ctx.font = "500 9px 'DM Mono', monospace";
      ctx.fillText(`TRACK ${trackIndex+1} / ${totalTracks}`, cx, cy + 24);
    }

    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(cx,cy, 7, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx,cy, 7, 0, Math.PI*2); ctx.stroke();

    labelTexture.needsUpdate = true;
  }

  function loadThumbForTrack(track){
    if(!track || !track.thumbnail || track._thumbImg) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = ()=>{
      if(state.currentDisk && state.currentDisk.tracks[state.currentTrackIndex] === track){
        drawRecordLabel(track, state.currentTrackIndex, state.currentDisk.tracks.length, state.currentDisk.labelColor);
      }
    };
    img.onerror = ()=>{ track._thumbImg = null; };
    track._thumbImg = img;
    img.src = track.thumbnail;
  }

  function generateWoodTexture(){
    const c = document.createElement("canvas"); c.width=c.height=1024;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0,0,0,1024);
    g.addColorStop(0, "#1f140a");
    g.addColorStop(0.5, "#2a1a0f");
    g.addColorStop(1, "#150c06");
    ctx.fillStyle = g; ctx.fillRect(0,0,1024,1024);
    for(let i=0;i<260;i++){
      const y = Math.random()*1024;
      ctx.strokeStyle = `rgba(${30+Math.random()*60},${15+Math.random()*30},${5+Math.random()*15},${0.2+Math.random()*0.35})`;
      ctx.lineWidth = 0.4 + Math.random()*1.5;
      ctx.beginPath();
      let x = 0;
      ctx.moveTo(0, y);
      while(x < 1024){
        const dx = 20 + Math.random()*80;
        const dy = (Math.random()-0.5)*6;
        ctx.lineTo(x + dx, y + dy);
        x += dx;
      }
      ctx.stroke();
    }
    for(let i=0;i<6;i++){
      const cx = Math.random()*1024, cy = Math.random()*1024;
      const r = 15 + Math.random()*35;
      const grd = ctx.createRadialGradient(cx,cy,2,cx,cy,r);
      grd.addColorStop(0, "rgba(10,5,2,0.8)");
      grd.addColorStop(1, "rgba(10,5,2,0)");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4,4);
    return tex;
  }

  /* ----- Ground ----- */
  const groundMat = new THREE.MeshStandardMaterial({
    map: generateWoodTexture(),
    roughness: 0.9,
    metalness: 0.0
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  /* =============== MUSIC NOTE PARTICLES (visualiser) =============== */
  const clock = new THREE.Clock();
  let noteTintColor = new THREE.Color("#E8B93F");
  let noteSpawnPos = new THREE.Vector3(0, 0.6, 0);

  const NOTE_GLYPHS = ['\u266A','\u266B','\u266C','\u2669','\u266D','\u266E'];

  function makeNoteTexture(glyph){
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,128,128);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 92px "Playfair Display", serif';
    ctx.shadowColor = 'rgba(255,255,255,0.95)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(glyph, 64, 64);
    ctx.shadowBlur = 10;
    ctx.fillText(glyph, 64, 64);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(glyph, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  const noteTextures = NOTE_GLYPHS.map(makeNoteTexture);

  const NOTE_POOL_SIZE = 48;
  const notes = [];
  for(let i=0;i<NOTE_POOL_SIZE;i++){
    const mat = new THREE.SpriteMaterial({
      map: noteTextures[i % noteTextures.length],
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.userData = { active:false };
    scene.add(sp);
    notes.push(sp);
  }
  let noteSpawnTimer = 0;

  function spawnNote(){
    const sp = notes.find(n => !n.userData.active);
    if(!sp) return;
    const d = sp.userData;
    d.active = true;
    sp.visible = true;

    sp.position.copy(noteSpawnPos);
    sp.position.x += (Math.random() - 0.5) * 0.55;
    sp.position.z += (Math.random() - 0.5) * 0.55;
    sp.position.y += (Math.random() - 0.2) * 0.05;

    d.vx = (Math.random() - 0.5) * 0.35;
    d.vy = 0.55 + Math.random() * 0.55;
    d.vz = (Math.random() - 0.5) * 0.25;

    d.age = 0;
    d.life = 2.4 + Math.random() * 1.4;
    d.wobbleFreq = 1.6 + Math.random() * 2.6;
    d.wobblePhase = Math.random() * Math.PI * 2;
    d.wobbleAmp = 0.2 + Math.random() * 0.35;
    d.rotSpeed = (Math.random() - 0.5) * 1.4;
    d.baseScale = 0.22 + Math.random() * 0.22;
    sp.scale.set(d.baseScale, d.baseScale, 1);
    sp.material.rotation = (Math.random() - 0.5) * 0.7;

    sp.material.color.copy(noteTintColor).lerp(new THREE.Color('#fff4d8'), 0.55);
    sp.material.opacity = 0;
    sp.material.map = noteTextures[(Math.random() * noteTextures.length) | 0];
    sp.material.needsUpdate = true;
  }

  function updateNotes(dt){
    if(state.isPlaying && state.isPowered){
      noteSpawnTimer += dt;
      const interval = 0.14;
      while(noteSpawnTimer >= interval){
        noteSpawnTimer -= interval;
        spawnNote();
      }
    } else {
      noteSpawnTimer = 0;
    }

    for(const sp of notes){
      const d = sp.userData;
      if(!d.active) continue;
      d.age += dt;
      if(d.age >= d.life){
        d.active = false;
        sp.visible = false;
        sp.material.opacity = 0;
        continue;
      }
      sp.position.x += d.vx * dt + Math.cos(d.age * d.wobbleFreq + d.wobblePhase) * d.wobbleAmp * dt;
      sp.position.z += d.vz * dt + Math.sin(d.age * d.wobbleFreq + d.wobblePhase) * d.wobbleAmp * dt;
      sp.position.y += d.vy * dt;
      d.vy *= 0.985;
      const t = d.age, L = d.life;
      let a;
      if(t < 0.25) a = t / 0.25;
      else if(t > L - 1.1) a = Math.max(0, (L - t) / 1.1);
      else a = 1;
      sp.material.opacity = a * 0.95;
      const s = d.baseScale * (0.9 + Math.sin(d.age * 5) * 0.12) * (1 + d.age * 0.08);
      sp.scale.set(s, s, 1);
      sp.material.rotation += d.rotSpeed * dt;
    }
  }

  /* =========================== GLB LOAD =========================== */
  let model, recordNode, tonearmNode, lidNode, platterNode, bodyNode, button1Node, button2Node;
  let recordLabelMesh = null;
  let recordMeshes = [];
  let recordSpinner = null;
  let tonearmPivot = null;
  let lidHinge = null;
  const lidOpenQuat = new THREE.Quaternion();
  const lidClosedQuat = new THREE.Quaternion();
  const lidOpenPos   = new THREE.Vector3();
  const lidClosedPos = new THREE.Vector3();
  const LID_CLOSED_BACK_OFFSET = -0.05;
  const LID_CLOSED_LEFT_OFFSET = -0.003;

  /* Tonearm tuning */
  const TONEARM_LIFT_FRAC        = 0.25;
  const TONEARM_PLAY_ROTATION    = -0.45;
  const TONEARM_PHASE_DELAY_MS   = 450;
  const TONEARM_PIVOT_END = 'auto+';
  const TONEARM_PIVOT_TOWARD_CENTER = 0.25;
  let TONEARM_LIFT_AMOUNT = 0;

  const interactiveMeshMap = new Map();
  function collectMeshes(node, key){
    if(!node) return [];
    const arr = [];
    node.traverse(c=>{
      if(c.isMesh){
        arr.push(c);
        interactiveMeshMap.set(c, key);
      }
    });
    return arr;
  }

  const loader = new THREE.GLTFLoader();
  const GLB_URLS = ['gagata5.glb', 'gagata.glb', 'gramophone.glb'];
  let lastGlbLoadError = null;

  function onGltfLoaded(gltf){
    model = gltf.scene;

    function findNode(name){
      let found = model.getObjectByName(name);
      if(found) return found;
      const lower = name.toLowerCase();
      model.traverse(o=>{ if(!found && o.name && o.name.toLowerCase() === lower) found = o; });
      if(found) return found;
      model.traverse(o=>{ if(!found && o.name && o.name.toLowerCase().includes(lower)) found = o; });
      return found;
    }

    recordNode  = findNode('record');
    tonearmNode = findNode('Tonearm');
    lidNode     = findNode('lid1');
    platterNode = findNode('platter');
    bodyNode    = findNode('body');
    button1Node = findNode('button1');
    button2Node = findNode('button2');

    model.traverse(function(child){
      if(child.isMesh){
        child.castShadow = true;
        child.receiveShadow = true;

        const matName = (child.material && child.material.name) || '';

        if (matName === '[Color_A14]') {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#6B1212'),
            roughness: 0.82, metalness: 0.08,
            bumpMap: generateLeatherTexture(), bumpScale: 0.6
          });
        } else if (matName === 'Vray_Steel1') {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#A8A8A8'),
            roughness: 0.35, metalness: 0.85
          });
        } else if (matName === 'Vray_Metal1') {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#B8C8D0'),
            roughness: 0.25, metalness: 0.92
          });
        } else if (matName === 'Vray_Metal2') {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#2A2A2A'),
            roughness: 0.4, metalness: 0.88
          });
        } else if (matName === 'Vray_Metal3') {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#4A4A4A'),
            roughness: 0.3, metalness: 0.9
          });
        } else if (matName === 'Vray_Clr1' || matName === '[Color_009]2') {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#1a1a1a'),
            roughness: 0.7, metalness: 0.1
          });
        }

        const isRecordChild =
          (child.parent && child.parent.name === 'record') ||
          (recordNode && (child === recordNode || isDescendantOf(child, recordNode))) ||
          child.name === 'record';

        if (isRecordChild) {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#111111'),
            roughness: 0.22, metalness: 0.18,
            map: generateVinylGrooveTexture()
          });
        }

        if(child.material && 'emissive' in child.material){
          child.userData._origEmissive = child.material.emissive.clone();
          child.userData._origEmissiveIntensity = child.material.emissiveIntensity ?? 0;
        }
      }
    });

    function isDescendantOf(obj, ancestor){
      let p = obj.parent;
      while(p){ if(p === ancestor) return true; p = p.parent; }
      return false;
    }

    addRecordLabel();

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = 2.5 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);
    box.setFromObject(model);
    const center2 = box.getCenter(new THREE.Vector3());
    const min2 = box.min.clone();
    model.position.x -= center2.x;
    model.position.z -= center2.z;
    model.position.y -= min2.y;

    scene.add(model);
    model.updateMatrixWorld(true);

    if(recordNode){
      scene.updateMatrixWorld(true);
      const worldBox = new THREE.Box3().setFromObject(recordNode);
      const worldCenter = worldBox.getCenter(new THREE.Vector3());

      recordSpinner = new THREE.Group();
      recordSpinner.name = 'recordSpinner';
      scene.add(recordSpinner);
      recordSpinner.position.copy(worldCenter);
      recordSpinner.attach(recordNode);
    }

    if(tonearmNode){
      scene.updateMatrixWorld(true);
      const tBox = new THREE.Box3().setFromObject(tonearmNode);
      const tH = tBox.max.y - tBox.min.y + 0.1;

      const tW = tBox.max.x - tBox.min.x;
      const tD = tBox.max.z - tBox.min.z;
      let pivotX, pivotZ;
      const centerX = (tBox.min.x + tBox.max.x) / 2;
      const centerZ = (tBox.min.z + tBox.max.z) / 2;

      let endChoice = TONEARM_PIVOT_END;
      if(endChoice === 'auto+' || endChoice === 'auto-'){
        const longerIsX = tW >= tD;
        const sign = endChoice === 'auto+' ? 'Max' : 'Min';
        endChoice = (longerIsX ? 'x' : 'z') + sign;
      }
      switch(endChoice){
        case 'xMin': pivotX = tBox.min.x; pivotZ = centerZ; break;
        case 'xMax': pivotX = tBox.max.x; pivotZ = centerZ; break;
        case 'zMin': pivotX = centerX;    pivotZ = tBox.min.z; break;
        case 'zMax': pivotX = centerX;    pivotZ = tBox.max.z; break;
        default:     pivotX = tBox.max.x; pivotZ = centerZ; break;
      }
      const blend = Math.max(0, Math.min(1, TONEARM_PIVOT_TOWARD_CENTER));
      pivotX = pivotX + (centerX - pivotX) * blend;
      pivotZ = pivotZ + (centerZ - pivotZ) * blend;
      const pivotPos = new THREE.Vector3(
        pivotX,
        (tBox.min.y + tBox.max.y) / 2,
        pivotZ
      );

      tonearmPivot = new THREE.Group();
      tonearmPivot.name = 'tonearmPivot';
      scene.add(tonearmPivot);
      tonearmPivot.position.copy(pivotPos);
      tonearmPivot.attach(tonearmNode);

      state.tonearmRestRotY   = tonearmPivot.rotation.y;
      state.tonearmRestPosY   = tonearmPivot.position.y;
      state.tonearmTargetRotY = state.tonearmRestRotY;
      state.tonearmTargetPosY = state.tonearmRestPosY;

      TONEARM_LIFT_AMOUNT = tH * TONEARM_LIFT_FRAC;
    }

    if(lidNode){
      scene.updateMatrixWorld(true);
      const lbox = new THREE.Box3().setFromObject(lidNode);
      const hingeX = (lbox.min.x + lbox.max.x) / 2;
      const hingeY = lbox.min.y;
      const hingeZ = lbox.min.z;

      lidHinge = new THREE.Group();
      lidHinge.name = 'lidHinge';
      scene.add(lidHinge);
      lidHinge.position.set(hingeX, hingeY, hingeZ);
      lidHinge.attach(lidNode);

      lidOpenQuat.copy(lidHinge.quaternion);
      const closedEuler = new THREE.Euler(-Math.PI * 0.55, 0, 0);
      lidClosedQuat.setFromEuler(closedEuler).multiply(lidOpenQuat);

      const lidDepth = lbox.max.z - lbox.min.z;
      const lidWidth = lbox.max.x - lbox.min.x;
      lidOpenPos.set(hingeX, hingeY, hingeZ);
      lidClosedPos.set(
        hingeX - lidWidth * LID_CLOSED_LEFT_OFFSET,
        hingeY,
        hingeZ - lidDepth * LID_CLOSED_BACK_OFFSET
      );

      lidHinge.quaternion.copy(lidClosedQuat);
      lidHinge.position.copy(lidClosedPos);
    }

    recordMeshes = collectMeshes(recordNode, 'record');
    collectMeshes(button1Node, 'button1');
    collectMeshes(button2Node, 'button2');
    collectMeshes(tonearmNode, 'tonearm');
    collectMeshes(bodyNode, 'body');
    collectMeshes(lidNode, 'lid');

    // Build the first-time "POWER BUTTON" hint anchored above the physical
    // power button. We place it in world space (not as a child of the model)
    // because the model is offset to sit on the ground; anchoring in world
    // space keeps the hint perfectly above the button regardless of that.
    if(button1Node && !powerHintDismissed){
      scene.updateMatrixWorld(true);
      const btnBox = new THREE.Box3().setFromObject(button1Node);
      const btnCenter = btnBox.getCenter(new THREE.Vector3());
      const btnTop = btnBox.max.y;
      const btnSize = btnBox.getSize(new THREE.Vector3());
      const btnScale = Math.max(btnSize.x, btnSize.z) || 0.05;

      powerHintGroup = new THREE.Group();
      powerHintGroup.name = 'powerHint';
      powerHintGroup.visible = false;
      powerHintGroup.renderOrder = 20;
      scene.add(powerHintGroup);

      // Sit the group at the button's top. Individual pieces live in local
      // space above this anchor (positive Y) and we bob the whole group.
      powerHintGroup.position.set(btnCenter.x, btnTop, btnCenter.z);

      const gold = new THREE.Color('#E8B93F');
      const arrowMat = new THREE.MeshStandardMaterial({
        color: gold,
        emissive: new THREE.Color('#8a5a00'),
        emissiveIntensity: 0.9,
        roughness: 0.28,
        metalness: 0.65,
        transparent: true,
        opacity: 0,
        depthTest: true
      });

      // Arrow: short thick shaft + tapered cone head, tip pointing DOWN at
      // the button. Size scaled to the button itself so small / large models
      // both get a sensibly proportioned hint.
      const shaftLen = btnScale * 3.2;
      const shaftRad = btnScale * 0.45;
      const headLen  = btnScale * 2.0;
      const headRad  = btnScale * 1.2;

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(shaftRad, shaftRad, shaftLen, 20),
        arrowMat
      );
      // Arrow tip sits just above the button top; head is below shaft.
      // Local Y=0 is the button top, +Y is up.
      const arrowGap = btnScale * 1.1; // space between button and arrow tip
      shaft.position.y = arrowGap + headLen + shaftLen / 2;

      const head = new THREE.Mesh(
        new THREE.ConeGeometry(headRad, headLen, 24),
        arrowMat
      );
      // Cone default tip points +Y; flip so the tip points -Y (down).
      head.rotation.z = Math.PI;
      head.position.y = arrowGap + headLen / 2;

      powerHintGroup.add(shaft);
      powerHintGroup.add(head);

      // "POWER BUTTON" label: a canvas-backed sprite (always faces the
      // camera, so it's readable from any orbit angle — the arrow below
      // is proper 3D geometry that does rotate with the scene).
      const labelCanvasHint = document.createElement('canvas');
      labelCanvasHint.width = 1024;
      labelCanvasHint.height = 256;
      const lctx = labelCanvasHint.getContext('2d');
      lctx.clearRect(0, 0, 1024, 256);
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      // Soft gold glow behind the letters
      lctx.shadowColor = 'rgba(232,185,63,0.95)';
      lctx.shadowBlur = 36;
      lctx.fillStyle = '#faf3e0';
      lctx.font = '700 110px "Playfair Display", serif';
      lctx.fillText('POWER BUTTON', 512, 128);
      // Re-punch for crispness
      lctx.shadowBlur = 10;
      lctx.fillText('POWER BUTTON', 512, 128);
      lctx.shadowBlur = 0;
      lctx.fillStyle = '#faf3e0';
      lctx.fillText('POWER BUTTON', 512, 128);

      const labelTexHint = new THREE.CanvasTexture(labelCanvasHint);
      labelTexHint.encoding = THREE.sRGBEncoding;
      labelTexHint.anisotropy = 4;
      const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: labelTexHint,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false
      }));
      // Sprite scale: world units for width × height. Keep the text
      // comfortably wide (~5× button size) and aspect-correct.
      const labelW = btnScale * 14;
      const labelH = labelW * (256 / 1024);
      labelSprite.scale.set(labelW, labelH, 1);
      // Place the label above the arrow's tail.
      labelSprite.position.y = arrowGap + headLen + shaftLen + labelH * 0.75;
      powerHintGroup.add(labelSprite);

      // Store refs for the animate loop — we need to fade everything in
      // unison and bob the whole group.
      powerHintGroup.userData = {
        arrowMat,
        labelMat: labelSprite.material,
        baseY: btnTop,
        t: 0
      };
    }

    const bb = new THREE.Box3().setFromObject(model);
    const topY = bb.max.y;
    const cx = (bb.min.x + bb.max.x)/2;
    const cz = (bb.min.z + bb.max.z)/2;

    if(recordNode){
      const rbox = new THREE.Box3().setFromObject(recordNode);
      noteSpawnPos.set(
        (rbox.min.x + rbox.max.x) / 2,
        rbox.max.y + 0.05,
        (rbox.min.z + rbox.max.z) / 2
      );
    } else {
      noteSpawnPos.set(cx, topY - 0.2, cz);
    }

    accentLight.position.set(cx, topY - 0.2, cz + 0.4);

    state.isModelLoaded = true;
    hideLoading();
    buildShelf();
  }

  function showAllGlbAttemptsFailed(){
    const ld = document.getElementById("loading");
    if(ld){
      const t = ld.querySelector(".title");
      const s = ld.querySelector(".sub");
      if(t) t.textContent = "Couldn't load the 3D model";
      if(s){
        const parts = [
          "1) Serve the folder that contains both index.html and gagata5.glb over HTTP (e.g. npm start, or python -m http.server 8000).",
          "2) Open http://localhost:<port>/ — not index.html via file://.",
          "3) Tried files: " + GLB_URLS.join(", ") + "."
        ];
        if(location.protocol === "file:"){
          parts.unshift("You are on file:// — browsers often block loading .glb from disk. Use a local HTTP server.");
        }
        if(lastGlbLoadError){
          const m = lastGlbLoadError.message || String(lastGlbLoadError);
          parts.push("Last error: " + m);
        }
        s.textContent = parts.join(" ");
      }
    }
  }

  function attemptGlbLoad(index){
    if(index >= GLB_URLS.length){ showAllGlbAttemptsFailed(); return; }
    const url = GLB_URLS[index];
    loader.load(url, onGltfLoaded, undefined, function(err){
      lastGlbLoadError = err;
      console.warn("GLB load failed for " + url + ", trying next…", err);
      attemptGlbLoad(index + 1);
    });
  }

  if(location.protocol === "file:"){
    const s = document.querySelector("#loading .sub");
    if(s) s.textContent = "Use http://localhost… — file:// often cannot load .glb. Starting load anyway…";
  }
  attemptGlbLoad(0);

  function addRecordLabel(){
    if(!recordNode) return;
    recordNode.updateWorldMatrix(true, false);
    const worldBox = new THREE.Box3().setFromObject(recordNode);
    const worldSize = worldBox.getSize(new THREE.Vector3());
    const worldCenter = worldBox.getCenter(new THREE.Vector3());

    const worldScale = new THREE.Vector3();
    recordNode.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale);
    const avgWorldScale = (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3;

    const worldRadius = Math.max(worldSize.x, worldSize.z) * 0.5;
    const localRadius = (worldRadius * 0.30) / (avgWorldScale || 1);

    const geom = new THREE.CircleGeometry(localRadius, 64);
    const mat = new THREE.MeshStandardMaterial({
      map: labelTexture,
      transparent: true,
      roughness: 0.55,
      metalness: 0.1
    });
    recordLabelMesh = new THREE.Mesh(geom, mat);
    recordLabelMesh.rotation.x = -Math.PI/2;

    const worldTop = new THREE.Vector3(worldCenter.x, worldBox.max.y, worldCenter.z);
    const localTop = recordNode.worldToLocal(worldTop.clone());
    recordLabelMesh.position.copy(localTop);
    const localLift = 0.006 / (avgWorldScale || 1);
    recordLabelMesh.position.y += localLift;
    recordLabelMesh.renderOrder = 2;
    recordNode.add(recordLabelMesh);

    drawRecordLabel({title:"Select a record"}, 0, 1, "#6B1212");
  }

  /* ============================ ANIMATIONS ============================ */
  function lerp(a,b,t){ return a + (b-a)*t; }

  function targetSpinSpeed(){
    if(!state.isPlaying || !state.isPowered) return 0;
    return state.speedMode === 45 ? 0.048 : 0.035;
  }

  function animate(){
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    const tgt = targetSpinSpeed();
    if(state.isPlaying && state.isPowered){
      state.currentSpeed = lerp(state.currentSpeed, tgt, 0.05);
    } else {
      state.currentSpeed *= 0.96;
      if(state.currentSpeed < 0.00005) state.currentSpeed = 0;
    }
    if(recordSpinner) recordSpinner.rotation.y += state.currentSpeed;
    else if(recordNode) recordNode.rotation.y += state.currentSpeed;

    if(tonearmPivot){
      const k = 10;
      const alpha = 1 - Math.exp(-k * dt);
      if(state.tonearmPose === 'rotating' || state.tonearmPose === 'pausing'){
        tonearmPivot.position.y = state.tonearmTargetPosY;
      } else {
        tonearmPivot.position.y = lerp(tonearmPivot.position.y, state.tonearmTargetPosY, alpha);
      }
      tonearmPivot.rotation.y = lerp(tonearmPivot.rotation.y, state.tonearmTargetRotY, alpha);

      const EPS_ROT = 0.002, EPS_POS = 0.002;
      const atTarget =
        Math.abs(tonearmPivot.position.y - state.tonearmTargetPosY) < EPS_POS &&
        Math.abs(tonearmPivot.rotation.y - state.tonearmTargetRotY) < EPS_ROT;
      if(atTarget){
        if(state.tonearmPose === 'lifting')       state.tonearmPose = 'lifted';
        else if(state.tonearmPose === 'rotating') state.tonearmPose = 'playing';
        else if(state.tonearmPose === 'pausing')  state.tonearmPose = 'paused';
      }
    }

    accentLight.intensity = lerp(accentLight.intensity, state.accentTarget, 0.03);

    // Buttons no longer pulse while music plays — we only want the short
    // click flash (see flashButtonNode below). Here we just gently ease
    // any residual emissive glow back to black so the flash fades out
    // smoothly after a press.
    if(button1Node){
      button1Node.traverse(c=>{
        if(c.isMesh && c.material && 'emissive' in c.material){
          c.material.emissiveIntensity = lerp(c.material.emissiveIntensity || 0, 0, 0.12);
        }
      });
    }
    if(button2Node){
      button2Node.traverse(c=>{
        if(c.isMesh && c.material && 'emissive' in c.material){
          c.material.emissiveIntensity = lerp(c.material.emissiveIntensity || 0, 0, 0.12);
        }
      });
    }

    if(lidHinge){
      const targetQuat = state.isLidOpen ? lidOpenQuat : lidClosedQuat;
      const targetPos  = state.isLidOpen ? lidOpenPos  : lidClosedPos;
      lidHinge.quaternion.slerp(targetQuat, 0.08);
      lidHinge.position.lerp(targetPos, 0.08);
    }

    // Power-button tutorial hint: only shown when the lid is FULLY open
    // and the user hasn't pressed the power button yet (this session or
    // any earlier session — we persist dismissal in localStorage).
    if(powerHintGroup){
      const fullyOpen = state.isLidOpen && lidHinge &&
        lidHinge.quaternion.angleTo(lidOpenQuat) < 0.03;
      const shouldShow = fullyOpen && !powerHintDismissed;

      // Fade toward the target state so opening/closing looks smooth.
      const fadeTarget = shouldShow ? 1 : 0;
      powerHintVisibleOpacity = lerp(powerHintVisibleOpacity, fadeTarget, 0.08);
      const u = powerHintGroup.userData;
      u.arrowMat.opacity = powerHintVisibleOpacity;
      u.labelMat.opacity = powerHintVisibleOpacity;

      if(powerHintVisibleOpacity > 0.01){
        powerHintGroup.visible = true;
        // Gentle bob + very slight scale pulse to draw the eye.
        u.t += dt;
        const bob = Math.sin(u.t * 2.2) * 0.04;
        powerHintGroup.position.y = u.baseY + 0.08 + bob;
        const pulse = 1 + Math.sin(u.t * 3.0) * 0.04;
        powerHintGroup.scale.setScalar(pulse);
      } else {
        powerHintGroup.visible = false;
      }
    }

    updateNotes(dt);

    // Auto-rotate on idle is intentionally disabled so the gramophone
    // doesn't drift off-center and leave the user looking at the back
    // when they come back to the tab. If we ever want the slow idle spin
    // back, flip controls.autoRotate = true here once idle > 4s.

    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  updatePowerIndicator();

  /* ========================== RAYCASTER ========================== */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const allInteractive = () => Array.from(interactiveMeshMap.keys());

  function onPointerMove(ev){
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    pointer.x = (x/window.innerWidth)*2 - 1;
    pointer.y = -(y/window.innerHeight)*2 + 1;

    state.lastInteraction = performance.now();
    controls.autoRotate = false;

    if(state.isModelLoaded){
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(allInteractive(), false);
      const key = hits[0] ? interactiveMeshMap.get(hits[0].object) : null;
      renderer.domElement.style.cursor = key === 'lid' ? 'pointer' : 'default';
    }
  }
  function onPointerDown(ev){
    state.lastInteraction = performance.now();
    controls.autoRotate = false;
    if(!state.isModelLoaded) return;
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    pointer.x = (x/window.innerWidth)*2 - 1;
    pointer.y = -(y/window.innerHeight)*2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(allInteractive(), false);
    if(!hits[0]) return;
    const mesh = hits[0].object;
    const key = interactiveMeshMap.get(mesh);
    handleNodeClick(key);
  }

  // Short emissive flash on a physical button, used as simple click feedback
  // for both the power button (button1) and the volume toggle (button2).
  // We don't permanently animate the buttons anymore — this is a transient
  // glow that the animate loop then fades out on its own (see the button
  // emissive-fade block near the top of animate()).
  function flashButtonNode(node, hex){
    if(!node) return;
    const col = new THREE.Color(hex || '#E8B93F');
    node.traverse(c=>{
      if(c.isMesh && c.material && 'emissive' in c.material){
        c.material.emissive = col.clone();
        c.material.emissiveIntensity = 1.0;
      }
    });
  }

  function handleNodeClick(key){
    switch(key){
      case 'record':
        if(!state.currentDisk) return;
        togglePlayPause();
        break;
      case 'button1':
        flashButtonNode(button1Node, '#E8B93F');
        togglePower();
        break;
      case 'button2':
        flashButtonNode(button2Node, '#E8B93F');
        toggleVolumePanel();
        break;
      case 'lid':
        toggleLid();
        break;
      default: break;
    }
  }

  function toggleLid(){
    state.isLidOpen = !state.isLidOpen;
    if(!state.isLidOpen){
      if(ytPlayer && state.ytReady){
        try{ ytPlayer.pauseVideo(); }catch(e){}
        try{ ytPlayer.seekTo(0, true); }catch(e){}
      }
      stopPlayback();
      state.tonearmPose = 'rest';
      state.tonearmLocked = false;
      state.currentSpeed = 0;
      state.accentTarget = 0;
      for(const sp of notes){
        sp.userData.active = false;
        sp.visible = false;
        sp.material.opacity = 0;
      }
      noteSpawnTimer = 0;
    }
  }

  renderer.domElement.addEventListener('mousemove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('touchmove', onPointerMove, { passive:true });

  /* ======================== YOUTUBE PLAYER ======================== */
  let ytPlayer = null;

  // Small helper: make absolutely sure the YT player is unmuted and at the
  // current volume level. We call this after every loadVideoById because
  // browsers sometimes start the iframe muted under their autoplay policy.
  function ensureAudible(){
    if(!ytPlayer || !state.ytReady) return;
    try{ ytPlayer.unMute(); }catch(e){}
    try{ ytPlayer.setVolume(Math.min(100, state.volume)); }catch(e){}
  }

  window.onYouTubeIframeAPIReady = function(){
    try{
      ytPlayer = new YT.Player('yt', {
        height:'180', width:'320',
        playerVars:{ autoplay:0, controls:0, disablekb:1, modestbranding:1, playsinline:1 },
        events:{
          'onReady': ()=>{
            state.ytReady = true;
            ensureAudible();
          },
          'onStateChange': onYtStateChange,
          'onError': ()=>{ advanceTrack(true); }
        }
      });
    }catch(e){
      state.ytFailed = true;
      document.getElementById('ytNotice').classList.add('show');
    }
  };
  setTimeout(()=>{
    if(!state.ytReady && !window.YT){
      state.ytFailed = true;
      document.getElementById('ytNotice').classList.add('show');
    }
  }, 8000);

  function onYtStateChange(e){
    if(!e) return;
    if(!state.isPowered || !state.isLidOpen) return;
    if(e.data === YT.PlayerState.PLAYING){
      state.isPlaying = true;
      state.accentTarget = 1.2;
      if(!state.tonearmLocked) runTonearmPlaySequence();
      updateNowPlaying();
      updatePlayIcon();
    } else if(e.data === YT.PlayerState.PAUSED){
      if(state.tonearmLocked) return;
      pausePlayback();
    } else if(e.data === YT.PlayerState.ENDED){
      advanceTrack();
    }
  }

  /* ======================== PLAYBACK STATE ======================== */
  let tonearmAnimSeq = 0;

  function tonearmLiftedRestPose(){
    state.tonearmTargetPosY = state.tonearmRestPosY + TONEARM_LIFT_AMOUNT;
    state.tonearmTargetRotY = state.tonearmRestRotY;
  }
  function tonearmPlayingPose(){
    state.tonearmTargetPosY = state.tonearmRestPosY + TONEARM_LIFT_AMOUNT;
    state.tonearmTargetRotY = state.tonearmRestRotY + TONEARM_PLAY_ROTATION;
  }

  function runTonearmPlaySequence(){
    if(state.tonearmPose === 'playing' || state.tonearmPose === 'rotating') return;
    if(state.tonearmPose === 'lifting') return;

    const gen = ++tonearmAnimSeq;

    if(state.tonearmPose === 'lifted' ||
       state.tonearmPose === 'paused' ||
       state.tonearmPose === 'pausing'){
      state.tonearmPose = 'rotating';
      tonearmPlayingPose();
      return;
    }

    state.tonearmPose = 'lifting';
    tonearmLiftedRestPose();
    setTimeout(()=>{
      if(gen !== tonearmAnimSeq) return;
      state.tonearmPose = 'rotating';
      tonearmPlayingPose();
    }, TONEARM_PHASE_DELAY_MS);
  }

  function runTonearmPauseSequence(){
    if(state.tonearmPose === 'paused' || state.tonearmPose === 'pausing') return;
    ++tonearmAnimSeq;
    state.tonearmPose = 'pausing';
    tonearmLiftedRestPose();
  }

  function startPlayback(){
    if(!state.isPowered || !state.isLidOpen) return;
    state.isPlaying = true;
    state.accentTarget = 1.2;
    runTonearmPlaySequence();
    updateNowPlaying();
    updatePlayIcon();
  }
  function pausePlayback(){
    state.isPlaying = false;
    runTonearmPauseSequence();
    state.accentTarget = 0.2;
    updatePlayIcon();
  }
  function stopPlayback(){
    state.isPlaying = false;
    tonearmAnimSeq++;
    state.tonearmLocked = false;
    state.tonearmPose = 'rest';
    state.tonearmTargetRotY = state.tonearmRestRotY;
    state.tonearmTargetPosY = state.tonearmRestPosY;
    state.accentTarget = 0;
    updatePlayIcon();
  }

  function togglePlayPause(){
    if(!state.currentDisk) return;
    if(!state.isPowered){ flashPowerNotice(); return; }
    if(!state.isLidOpen){ flashLidNotice(); return; }
    if(!state.ytReady){
      state.isPlaying = !state.isPlaying;
      if(state.isPlaying){
        runTonearmPlaySequence();
        state.accentTarget = 1.2;
      } else {
        runTonearmPauseSequence();
        state.accentTarget = 0.2;
      }
      updateNowPlaying();
      updatePlayIcon();
      return;
    }
    try{
      const st = ytPlayer.getPlayerState();
      if(st === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
      else ytPlayer.playVideo();
    }catch(e){}
  }

  let lidNoticeTimer = null;
  function flashLidNotice(){
    const el = document.getElementById('lidNotice');
    if(!el) return;
    el.classList.add('show');
    clearTimeout(lidNoticeTimer);
    lidNoticeTimer = setTimeout(()=> el.classList.remove('show'), 2200);
  }

  function togglePower(){
    state.isPowered = !state.isPowered;
    if(!state.isPowered){
      if(ytPlayer && state.ytReady) try{ ytPlayer.pauseVideo(); }catch(e){}
      stopPlayback();
      // Volume slider is a sibling of playback — when we cut power we
      // also collapse the slider so the UI truthfully reflects that
      // audio can't come out. User brings it back with a button2 press
      // once the machine is powered on again.
      const volEl = document.getElementById('volume');
      if(volEl) volEl.classList.add('hidden');
    }
    updatePowerIndicator();
    // The very first press teaches the user where the power button is —
    // hide the arrow/label for the rest of time.
    dismissPowerHint();
  }

  function updatePowerIndicator(){
    const el = document.getElementById('powerIndicator');
    const st = document.getElementById('powerState');
    if(!el || !st) return;
    if(state.isPowered){ el.classList.add('on'); st.textContent = 'on'; }
    else { el.classList.remove('on'); st.textContent = 'off'; }
  }

  let powerNoticeTimer = null;
  function flashPowerNotice(){
    const el = document.getElementById('powerNotice');
    if(!el) return;
    el.classList.add('show');
    clearTimeout(powerNoticeTimer);
    powerNoticeTimer = setTimeout(()=> el.classList.remove('show'), 2200);
  }

  // Button 2 controls the visibility of the on-screen volume slider —
  // clicking it shows or hides #volume. We toggle a .hidden class so
  // the reveal is done entirely via CSS.
  //
  // Important: the slider is gated behind isPowered. If the user taps
  // the button while the gramophone is off, we just flash the "press
  // the power button" notice instead of silently doing nothing. This
  // keeps the UI honest — no volume control can do anything while the
  // machine is asleep.
  function toggleVolumePanel(){
    if(!state.isPowered){
      flashPowerNotice();
      return;
    }
    const el = document.getElementById('volume');
    if(!el) return;
    el.classList.toggle('hidden');
  }

  /* ========================= DISK PLACEMENT ========================= */
  function placeDisk(disk){
    if(!state.isModelLoaded || !disk) return;
    if(!state.isPowered){ flashPowerNotice(); return; }
    if(!state.isLidOpen){ flashLidNotice(); return; }

    // Lazy-loaded disks (e.g. YouTube playlists) — fetch their tracks
    // on demand, then recurse with the fully-populated disk.
    if(typeof disk._fetchTracks === 'function' && !disk.tracks){
      setShelfLoading(disk.id, true);
      disk._fetchTracks()
        .then(tracks => {
          disk.tracks = tracks;
          delete disk._fetchTracks;
          setShelfLoading(disk.id, false);
          placeDisk(disk);
        })
        .catch(err => {
          setShelfLoading(disk.id, false);
          console.warn('[gramophone] track fetch failed:', err);
          alert(err.message || 'Could not load this record from YouTube.');
        });
      return;
    }

    state.currentDisk = disk;
    state.currentTrackIndex = 0;
    noteTintColor = new THREE.Color(disk.labelColor || "#B5860E");

    const t0 = disk.tracks[0];
    loadThumbForTrack(t0);
    drawRecordLabel(t0, 0, disk.tracks.length, disk.labelColor);

    if(recordNode){
      const origScale = recordNode.userData._origScaleY ?? recordNode.scale.y;
      recordNode.userData._origScaleY = origScale;
      const duration = 450;
      const start = performance.now();
      const fromY = recordNode.scale.y;
      function shrink(){
        const p = Math.min(1, (performance.now()-start)/duration);
        recordNode.scale.y = lerp(fromY, 0.01, p);
        if(p < 1) requestAnimationFrame(shrink);
        else grow();
      }
      function grow(){
        const s2 = performance.now();
        function step(){
          const p = Math.min(1, (performance.now()-s2)/duration);
          recordNode.scale.y = lerp(0.01, origScale, p);
          if(p < 1) requestAnimationFrame(step);
          else kickPlay();
        }
        step();
      }
      shrink();
    } else {
      kickPlay();
    }

    function kickPlay(){
      startPlayback();
      if(state.ytReady){
        try{ ytPlayer.loadVideoById(t0.videoId); } catch(e){}
        ensureAudible();
      }
    }

    updateNowPlaying();
    updateShelfActive();
    document.getElementById('transport').classList.add('visible');
  }

  function loadTrackAt(index){
    if(!state.currentDisk) return;
    if(!state.isPowered){ flashPowerNotice(); return; }
    if(!state.isLidOpen){ flashLidNotice(); return; }
    const tracks = state.currentDisk.tracks;
    if(index < 0 || index >= tracks.length) return;

    const alreadyPlayingPose =
      state.tonearmPose === 'playing' || state.tonearmPose === 'rotating';

    state.currentTrackIndex = index;
    const t = tracks[index];
    loadThumbForTrack(t);
    drawRecordLabel(t, index, tracks.length, state.currentDisk.labelColor);

    if(alreadyPlayingPose){
      const gen = ++tonearmAnimSeq;
      state.tonearmLocked = true;
      state.tonearmPose = 'rotating';
      tonearmLiftedRestPose();

      setTimeout(()=>{
        if(gen !== tonearmAnimSeq) return;
        state.tonearmPose = 'rotating';
        tonearmPlayingPose();
      }, TONEARM_PHASE_DELAY_MS);

      setTimeout(()=>{
        if(gen !== tonearmAnimSeq) return;
        state.tonearmLocked = false;
      }, TONEARM_PHASE_DELAY_MS * 2 + 200);

      state.isPlaying = true;
      state.accentTarget = 1.2;
      updatePlayIcon();
    } else {
      startPlayback();
    }

    if(state.ytReady){
      try{ ytPlayer.loadVideoById(t.videoId); }catch(e){}
      ensureAudible();
    }
    updateNowPlaying();
  }

  function advanceTrack(errSkip){
    if(!state.currentDisk) return;
    if(state.currentTrackIndex < state.currentDisk.tracks.length - 1){
      loadTrackAt(state.currentTrackIndex + 1);
    } else {
      stopPlayback();
      if(ytPlayer && state.ytReady){ try{ ytPlayer.stopVideo(); }catch(e){} }
      updateNowPlaying();
    }
  }
  function prevTrack(){
    if(!state.currentDisk) return;
    if(state.currentTrackIndex > 0){
      loadTrackAt(state.currentTrackIndex - 1);
    } else {
      if(state.ytReady){ try{ ytPlayer.seekTo(0, true); ytPlayer.playVideo(); }catch(e){} }
    }
  }

  /* ========================= UI BINDINGS ========================= */
  const elNP = document.getElementById('nowPlaying');
  const elNPT = document.getElementById('npTitle');
  const elNPA = document.getElementById('npArtist');
  const elNPTr = document.getElementById('npTrack');
  const elNPNum = document.getElementById('npTrackNum');

  const ttTitle = document.getElementById('ttTitle');
  const ttNum = document.getElementById('ttNum');
  const playBtn = document.getElementById('playBtn');

  function updateNowPlaying(){
    if(!state.currentDisk){ elNP.classList.remove('visible'); return; }
    elNP.classList.add('visible');
    const d = state.currentDisk;
    const t = d.tracks[state.currentTrackIndex];
    elNPT.textContent = d.title;
    elNPA.textContent = d.artist;
    elNPTr.textContent = t?.title || '';
    elNPNum.textContent = `Track ${state.currentTrackIndex+1} / ${d.tracks.length}`;
    if(ttTitle) ttTitle.textContent = t?.title || '';
    if(ttNum) ttNum.textContent = `${state.currentTrackIndex+1} / ${d.tracks.length}`;
  }

  function updatePlayIcon(){
    if(!playBtn) return;
    playBtn.innerHTML = state.isPlaying ? '&#10074;&#10074;' : '&#9658;';
    playBtn.title = state.isPlaying ? 'Pause' : 'Play';
  }

  document.getElementById('prevBtn').addEventListener('click', prevTrack);
  document.getElementById('nextBtn').addEventListener('click', ()=>advanceTrack(false));
  playBtn.addEventListener('click', ()=>{
    if(!state.currentDisk) return;
    togglePlayPause();
  });
  updatePlayIcon();

  /* ---- Volume controls: 0–100% slider.
     We used to run 0–200 with a "boost zone" above 100, but because the
     YouTube IFrame API hard-clamps setVolume to 0–100 and the iframe is
     cross-origin (we can't re-tap its audio with WebAudio), anything above
     100 only changed the UI, never the actual loudness. Capped here so the
     reading matches reality. */
  const VOL_MAX = 100;
  const volBar = document.getElementById('volBar');
  const volFill = document.getElementById('volFill');
  const volThumb = document.getElementById('volThumb');
  const volLabel = document.getElementById('volLabel');
  const volUp = document.getElementById('volUp');
  const volDown = document.getElementById('volDown');

  function setVolume(v){
    state.volume = Math.max(0, Math.min(VOL_MAX, Math.round(v)));
    const pct = (state.volume / VOL_MAX) * 100;
    if(volFill){
      volFill.style.width = pct + '%';
      volFill.classList.remove('boost');
    }
    if(volThumb) volThumb.style.left = pct + '%';
    if(volLabel){
      volLabel.textContent = state.volume + '%';
      volLabel.classList.remove('boost');
    }
    if(state.ytReady && ytPlayer){
      try{ ytPlayer.setVolume(state.volume); }catch(e){}
    }
  }
  setVolume(75);

  volUp.addEventListener('click', ()=> setVolume(state.volume + 5));
  volDown.addEventListener('click', ()=> setVolume(state.volume - 5));

  let volDrag = false;
  function volFromEvent(e){
    const rect = volBar.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return ratio * VOL_MAX;
  }
  volBar.addEventListener('pointerdown', e=>{
    e.preventDefault();
    volDrag = true;
    volBar.classList.add('dragging');
    try{ volBar.setPointerCapture(e.pointerId); }catch(_){}
    setVolume(volFromEvent(e));
  });
  volBar.addEventListener('pointermove', e=>{ if(volDrag) setVolume(volFromEvent(e)); });
  const endVolDrag = e=>{
    if(!volDrag) return;
    volDrag = false;
    volBar.classList.remove('dragging');
    try{ volBar.releasePointerCapture(e.pointerId); }catch(_){}
  };
  volBar.addEventListener('pointerup', endVolDrag);
  volBar.addEventListener('pointercancel', endVolDrag);
  volBar.addEventListener('lostpointercapture', endVolDrag);

  document.getElementById('volume').addEventListener('wheel', e=>{
    e.preventDefault();
    setVolume(state.volume + (e.deltaY < 0 ? 5 : -5));
  }, { passive:false });

  /* ---- Loading ---- */
  function hideLoading(){
    setTimeout(()=>{
      const l = document.getElementById('loading');
      l.classList.add('hide');
      setTimeout(()=>l.remove(), 1300);
    }, 200);
  }

  /* ---- Shelf ---- */
  const shelf = document.getElementById('shelf');

  function buildShelf(){
    shelf.innerHTML = '';
    disks.forEach(disk=>{
      const card = document.createElement('div');
      card.className = 'disk';
      card.dataset.diskId = disk.id;
      card.draggable = true;

      const art = document.createElement('div');
      art.className = 'art';
      art.style.background = disk.labelColor || '#222';
      // _thumb is the disk-level art (YT playlists); for demo/custom disks
      // we fall back to the first track's thumbnail.
      const thumbUrl = disk._thumb || disk.tracks?.[0]?.thumbnail;
      if(thumbUrl){
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.src = thumbUrl;
        img.onerror = ()=>{ img.remove(); };
        art.appendChild(img);
      }
      card.appendChild(art);

      const t = document.createElement('div');
      t.className = 't'; t.textContent = disk.title; card.appendChild(t);
      const a = document.createElement('div');
      a.className = 'a'; a.textContent = disk.artist || ''; card.appendChild(a);

      // Album badge when we know tracks.length > 1, OR the disk is a
      // lazy playlist (we can't know count yet, but it's multi-track).
      const looksAlbum = (disk.tracks && disk.tracks.length > 1) || typeof disk._fetchTracks === 'function';
      if(looksAlbum){
        const b = document.createElement('div');
        b.className = 'badge';
        b.textContent = disk.tracks ? `${disk.tracks.length} tracks` : 'album';
        card.appendChild(b);
      }

      card.addEventListener('click', ()=> placeDisk(disk));
      card.addEventListener('dragstart', e=>{
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', disk.id);
        e.dataTransfer.effectAllowed = 'copy';
        document.getElementById('dropHint').classList.add('show');
      });
      card.addEventListener('dragend', ()=>{
        card.classList.remove('dragging');
        document.getElementById('dropHint').classList.remove('show');
      });

      shelf.appendChild(card);
    });
    updateShelfActive();
  }

  function updateShelfActive(){
    shelf.querySelectorAll('.disk').forEach(el=>{
      const on = state.currentDisk && el.dataset.diskId === state.currentDisk.id;
      el.classList.toggle('active', !!on);
    });
  }

  // Small loading shimmer applied to the card whose tracks are being fetched.
  function setShelfLoading(diskId, on){
    const card = shelf.querySelector(`.disk[data-disk-id="${CSS.escape(diskId)}"]`);
    if(card) card.classList.toggle('loading', !!on);
  }

  renderer.domElement.addEventListener('dragover', e=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
  renderer.domElement.addEventListener('drop', e=>{
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const d = disks.find(x=>x.id===id);
    if(d) placeDisk(d);
    document.getElementById('dropHint').classList.remove('show');
  });

  /* ================== CRAFT YOUR RECORD MODAL ================== */
  const modal = document.getElementById('modal');
  const slotsEl = document.getElementById('slots');
  const mTitle = document.getElementById('mTitle');
  const mArtist = document.getElementById('mArtist');
  const mColor = document.getElementById('mColor');

  let slotData = [
    { url:'', track:null }, { url:'', track:null }, { url:'', track:null },
    { url:'', track:null }, { url:'', track:null }, { url:'', track:null }
  ];

  function extractVideoId(url){
    try{
      const u = new URL(url);
      if(u.hostname.includes('youtu.be')) return u.pathname.replace('/','').slice(0,11);
      const vid = u.searchParams.get('v');
      if(vid) return vid.slice(0,11);
      const m = u.pathname.match(/\/(embed|shorts)\/([A-Za-z0-9_-]{11})/);
      if(m) return m[2];
    }catch(e){
      const m = url.match(/([A-Za-z0-9_-]{11})/);
      if(m) return m[1];
    }
    return null;
  }

  function buildSlots(){
    slotsEl.innerHTML = '';
    slotData.forEach((slot, i)=>{
      const row = document.createElement('div');
      row.className = 'slot' + (slot.track ? ' filled' : '');
      row.draggable = true;
      row.dataset.idx = i;

      row.innerHTML = `
        <div class="num">${i+1}</div>
        <div class="grip" title="Drag to reorder">≡</div>
        <div class="thumb">${slot.track ? `<img src="${slot.track.thumbnail}" />` : ''}</div>
        <div class="info"><div class="tt">${slot.track ? slot.track.title : ''}</div></div>
        <input type="url" placeholder="Paste YouTube URL…" value="${slot.url||''}" />
        <button class="add">Add</button>
        <button class="rm" title="Remove">×</button>
      `;

      const input = row.querySelector('input');
      const addBtn = row.querySelector('.add');
      const rmBtn = row.querySelector('.rm');

      input.addEventListener('input', e=>{ slotData[i].url = e.target.value; });
      input.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); addBtn.click(); } });

      addBtn.addEventListener('click', async ()=>{
        const vid = extractVideoId(input.value.trim());
        const existingErr = row.querySelector('.err'); if(existingErr) existingErr.remove();
        if(!vid){
          const errEl = document.createElement('div'); errEl.className='err'; errEl.textContent='Not a valid YouTube URL'; row.appendChild(errEl);
          return;
        }
        try{
          const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`);
          if(!res.ok) throw new Error('oEmbed failed');
          const j = await res.json();
          slotData[i].track = {
            videoId: vid, title: j.title,
            thumbnail: j.thumbnail_url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
          };
          buildSlots();
        }catch(err){
          slotData[i].track = {
            videoId: vid, title: 'Track ' + (i+1),
            thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
          };
          buildSlots();
        }
      });

      rmBtn.addEventListener('click', ()=>{
        slotData[i].url = '';
        slotData[i].track = null;
        buildSlots();
      });

      row.addEventListener('dragstart', e=>{
        e.dataTransfer.setData('application/x-slot', String(i));
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', e=>{
        if(e.dataTransfer.types.includes('application/x-slot')){
          e.preventDefault();
          row.classList.add('dragover');
        }
      });
      row.addEventListener('dragleave', ()=>row.classList.remove('dragover'));
      row.addEventListener('drop', e=>{
        e.preventDefault();
        row.classList.remove('dragover');
        const from = parseInt(e.dataTransfer.getData('application/x-slot'),10);
        if(isNaN(from) || from === i) return;
        const item = slotData[from];
        slotData.splice(from, 1);
        slotData.splice(i, 0, item);
        buildSlots();
      });

      slotsEl.appendChild(row);
    });
  }

  function openModal(){
    slotData = [
      { url:'', track:null }, { url:'', track:null }, { url:'', track:null },
      { url:'', track:null }, { url:'', track:null }, { url:'', track:null }
    ];
    mTitle.value = ''; mArtist.value = ''; mColor.value = '#8B1A1A';
    buildSlots();
    modal.classList.add('open');
  }
  function closeModal(){ modal.classList.remove('open'); }

  document.getElementById('addBtn').addEventListener('click', (e)=>{
    // If remote-shelf has swapped this button into search mode, it intercepts
    // the click in the capture phase. Otherwise we open the Craft modal.
    if(e.defaultPrevented) return;
    openModal();
  });
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', e=>{ if(e.target === modal) closeModal(); });

  document.getElementById('saveBtn').addEventListener('click', ()=>{
    const title = mTitle.value.trim();
    if(!title){ mTitle.focus(); mTitle.style.borderColor = '#ff8080'; setTimeout(()=>mTitle.style.borderColor='', 800); return; }
    const tracks = slotData.filter(s=>s.track).map(s=>s.track);
    if(tracks.length === 0){ slotsEl.querySelectorAll('input').forEach(i=>{ i.style.borderColor='#ff8080'; setTimeout(()=>i.style.borderColor='',800); }); return; }

    const disk = {
      id: 'custom-' + Date.now().toString(36),
      title,
      artist: mArtist.value.trim() || 'Custom Artist',
      labelColor: mColor.value,
      tracks,
      custom: true
    };
    disks.push(disk);
    persistCustomDisks();
    buildShelf();
    closeModal();
    shelf.scrollLeft = shelf.scrollWidth;
  });

  /* ========================= RESIZE ========================= */
  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* NOTE: We used to have a capture-phase stopPropagation() on #ui to
     "block OrbitControls when clicking overlays". That was both redundant
     (UI panels already have pointer-events:auto, so the canvas never
     receives their pointerdown) AND harmful — stopPropagation in capture
     prevents the event from reaching the overlay's own handlers. That
     silently broke the volume-slider drag. We no longer need it. */

  /* ============ INTEGRATION API FOR ESM MODULES ============ */
  // Exposed so src/remote-shelf.js can swap the shelf contents when the
  // user signs in / out, fetch album tracks on demand, and so on. Only
  // the minimum surface the remote layer actually needs.
  window.GRAMOPHONE = {
    state,
    placeDisk,
    stopPlayback,
    setDisks(newDisks){
      disks = [...newDisks];
      buildShelf();
    },
    resetDisks(){
      disks = [...builtInDisks];
      loadCustomDisks();
      buildShelf();
    },
    rebuildShelf: buildShelf,
    getBuiltInDisks: () => builtInDisks.map(d => ({ ...d, tracks: d.tracks.slice() })),
  };

})();
