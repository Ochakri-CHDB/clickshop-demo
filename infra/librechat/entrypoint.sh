#!/bin/sh
set -e

echo "[entrypoint] Generating librechat.yaml…"
node /app/sync-prompts.mjs

INDEX="/app/client/dist/index.html"
if [ -f "$INDEX" ] && ! grep -q "clickshop-theme" "$INDEX"; then
  node -e "
    const fs = require('fs');
    const html = fs.readFileSync('$INDEX', 'utf8');
    const snippet = '<script id=\"clickshop-theme\">try{localStorage.setItem(\"theme\",\"dark\");document.documentElement.classList.add(\"dark\");}catch(e){}</script>';
    fs.writeFileSync('$INDEX', html.replace('</head>', snippet + '</head>'));
  "
fi

# Same-origin helper used by the ClickShop web app iframe: logs in with the
# persona credentials passed by the app, then opens the requested agent.
cat > /app/client/dist/auto-login.html << 'AUTOEOF'
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ClickShop</title>
<style>body{background:#0C0D0E;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;color:#71717a}
.spinner{width:32px;height:32px;border:3px solid #27272a;border-top-color:#FAFF69;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body><div style="text-align:center"><div class="spinner" style="margin:0 auto 12px"></div><div id="msg">Loading agent…</div></div>
<script>
(async()=>{
  var p=new URLSearchParams(location.search);
  var email=p.get('email'),password=p.get('password')||'',spec=p.get('spec')||'';
  if(!email||!password){document.getElementById('msg').innerText='Missing credentials';return;}
  async function login(attempt){
    var res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,password:password}),credentials:'include'});
    if(res.status===429&&attempt<3){await new Promise(function(r){setTimeout(r,attempt*2000)});return login(attempt+1);}
    return res;
  }
  try{
    var res=await login(1);
    var data=await res.json();
    if(!data.token){document.getElementById('msg').innerText='Login failed ('+res.status+')';return;}
    localStorage.setItem('theme','dark');
    location.replace(spec?'/c/new?spec='+encodeURIComponent(spec):'/c/new');
  }catch(e){document.getElementById('msg').innerText='Error: '+e.message;}
})();
</script></body></html>
AUTOEOF

export LOGIN_MAX="${LOGIN_MAX:-999}"
export LOGIN_WINDOW="${LOGIN_WINDOW:-1}"
export MESSAGE_MAX="${MESSAGE_MAX:-999}"
export MESSAGE_WINDOW="${MESSAGE_WINDOW:-1}"
export ALLOW_REGISTRATION="${ALLOW_REGISTRATION:-false}"
export ALLOW_SOCIAL_LOGIN="${ALLOW_SOCIAL_LOGIN:-false}"

echo "[entrypoint] Starting LibreChat…"
exec node /app/api/server/index.js
