import appHandler from './app.js';

function forwardHeaders(res, headers) {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
}

export default function handler(req, res) {
  let statusCode = 200;
  const headers = {};

  const proxy = {
    status(code) {
      statusCode = Number(code || 200);
      return proxy;
    },
    setHeader(key, value) {
      headers[String(key)] = value;
      return proxy;
    },
    end(body = '') {
      forwardHeaders(res, headers);
      res.setHeader('x-dabbir-shell-authority', 'owner-first-v4');
      res.setHeader('x-dabbir-owner-experience', 'verified-copilot-v1.3-workspace-compat');
      res.statusCode = statusCode;
      return res.end(body);
    },
    send(body = '') {
      forwardHeaders(res, headers);
      res.setHeader('x-dabbir-shell-authority', 'owner-first-v4');
      res.setHeader('x-dabbir-owner-experience', 'verified-copilot-v1.3-workspace-compat');
      res.statusCode = statusCode;
      const html = typeof body === 'string'
        ? body.replace('</body>', '<script src="/api/brand-ui"></script>\n<script src="/api/dabbir-whatsapp-embedded-ui"></script>\n<script src="/api/dabbir-whatsapp-connect-guard-ui"></script>\n<script src="/api/timezone-ui"></script>\n<script src="/api/auth/recovery-ui"></script>\n<script src="/api/chat-human-ui"></script>\n<script src="/api/translation-ui"></script>\n<script src="/api/owner-operations-ui"></script>\n<script src="/api/service-operations-ui"></script>\n<script src="/api/activity-profile-ui"></script>\n<script src="/api/owner-action-center-ui"></script>\n<script src="/api/dabbir-owner-away-ui"></script>\n<script src="/api/dabbir-owner-decision-memory-ui"></script>\n<script src="/api/business-profile-ui"></script>\n<script>(()=>{if(window.__dabbirCompactHoursPreview)return;window.__dabbirCompactHoursPreview=true;const st=document.createElement("style");st.textContent="@media(max-width:700px){#screen-settings.active{padding-bottom:118px!important}.dk-hours-wrap{padding:8px!important;border-radius:14px!important}.dk-hours-help{font-size:9px!important;line-height:1.55!important;margin:0 0 8px!important}.dk-hours-tools{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;margin-bottom:8px!important}.dk-hours-tools button{width:100%!important;min-height:38px!important;padding:6px 7px!important;font-size:9px!important;border-radius:10px!important}.dk-hours-list{gap:6px!important}.dk-hours-row{display:grid!important;grid-template-columns:minmax(88px,.9fr) minmax(0,1fr) minmax(0,1fr)!important;gap:6px!important;align-items:center!important;min-height:64px!important;padding:7px 8px!important;border-radius:12px!important}.dk-day-toggle{grid-column:auto!important;display:flex!important;align-items:center!important;gap:7px!important;min-height:44px!important;font-size:10px!important;white-space:nowrap!important}.dk-day-toggle input{appearance:none!important;-webkit-appearance:none!important;box-sizing:border-box!important;flex:0 0 38px!important;width:38px!important;min-width:38px!important;max-width:38px!important;height:22px!important;min-height:22px!important;max-height:22px!important;padding:0!important;margin:0!important;border:1px solid #444b53!important;border-radius:999px!important;background:#24282d!important;position:relative!important}.dk-day-toggle input:after{content:\"\"!important;position:absolute!important;width:16px!important;height:16px!important;top:2px!important;inset-inline-start:2px!important;border-radius:50%!important;background:#8e959d!important;transition:.16s!important}.dk-day-toggle input:checked{background:#2a3719!important;border-color:#6d8234!important}.dk-day-toggle input:checked:after{inset-inline-start:18px!important;background:var(--accent)!important}html[dir=ltr] .dk-day-toggle input:checked:after{left:18px!important}.dk-time{display:grid!important;grid-template-columns:1fr!important;gap:3px!important;min-width:0!important}.dk-time span{font-size:8px!important;color:#7f8790!important;text-align:center!important;line-height:1.2!important}.dk-time input[data-compact-source]{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;min-width:1px!important;max-width:1px!important;height:1px!important;min-height:1px!important;max-height:1px!important;padding:0!important;margin:0!important;border:0!important}.dk-compact-time{appearance:none!important;-webkit-appearance:none!important;width:100%!important;min-width:0!important;height:42px!important;min-height:42px!important;padding:0 8px!important;border:1px solid #30363d!important;border-radius:10px!important;background:#181b1f!important;color:#fff!important;font-size:15px!important;font-weight:800!important;font-variant-numeric:tabular-nums!important;text-align:center!important;text-align-last:center!important;direction:ltr!important;outline:none!important}.dk-compact-time:focus{border-color:#687c37!important;box-shadow:0 0 0 3px #d7ff5f12!important}.dk-compact-time:disabled{opacity:.35!important;background:#121416!important;color:#777!important}.dk-hours-row:not(.is-open){grid-template-columns:1fr!important;min-height:48px!important}.dk-hours-row:not(.is-open) .dk-time{display:none!important}}";document.head.append(st);const vals=()=>{const a=[];for(let h=0;h<24;h++)for(const m of [0,30])a.push(String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"));return a};function sync(row){for(const src of row.querySelectorAll("input[type=time]")){let sel=src.nextElementSibling&&src.nextElementSibling.classList.contains("dk-compact-time")?src.nextElementSibling:null;if(!sel){src.dataset.compactSource="1";sel=document.createElement("select");sel.className="dk-compact-time";for(const v of vals()){const o=document.createElement("option");o.value=v;o.textContent=v;sel.append(o)}if(src.value&&!Array.from(sel.options).some(o=>o.value===src.value)){const o=document.createElement("option");o.value=src.value;o.textContent=src.value;sel.append(o)}sel.value=src.value||"08:00";sel.addEventListener("change",()=>{src.value=sel.value;src.dispatchEvent(new Event("change",{bubbles:true}))});src.after(sel)}sel.disabled=src.disabled;if(src.value&&sel.value!==src.value)sel.value=src.value}const cb=row.querySelector(".dk-day-toggle input[type=checkbox]");if(cb&&!cb.dataset.compactBound){cb.dataset.compactBound="1";cb.addEventListener("change",()=>requestAnimationFrame(()=>sync(row)))}}function enhance(){const card=document.querySelector("#dabbirBusinessKnowledge");if(!card)return;card.querySelectorAll(".dk-hours-row").forEach(sync);const tools=card.querySelector(".dk-hours-tools");if(tools&&!tools.dataset.compactBound){tools.dataset.compactBound="1";tools.addEventListener("click",()=>requestAnimationFrame(()=>card.querySelectorAll(".dk-hours-row").forEach(sync)))}}new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});enhance();setTimeout(enhance,400);setTimeout(enhance,1000)})()</script>\n<script src="/api/dabbir-customer-number-ui"></script>\n<script src="/api/dabbir-billing-ui"></script>\n<script src="/api/platform-customers-ui"></script>\n<script src="/api/platform-customer-support-ui"></script>\n<script src="/api/platform-recovery-reconciliation-ui"></script>\n<script src="/api/dabbir-owner-first-ui"></script>\n<script src="/api/verified-metrics-ui"></script>\n<script src="/api/customer-activation-ui"></script>\n<script>(()=>{try{if(!Object.prototype.hasOwnProperty.call(window,"workspace"))Object.defineProperty(window,"workspace",{configurable:true,enumerable:false,get(){try{return workspace}catch{return null}}})}catch{}})();</script>\n<script src="/api/owner-copilot-ui"></script>\n<script src="/api/dabbir-contextual-navigation-ui"></script>\n<script src="/api/auth-session-stability-ui"></script>\n</body>')
        : body;
      return res.end(html);
    },
  };

  return appHandler(req, proxy);
}
