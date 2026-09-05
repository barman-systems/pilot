export const OWNER_COMMAND_CENTER_DESIGN_SYSTEM=String.raw`<style id="ownerCommandCenterDesignSystem">
:root{--owner-font-xs:12px;--owner-font-sm:13px;--owner-font-md:14px;--owner-font-lg:16px;--owner-touch:46px;--owner-accent:#5b6ff5;--owner-accent-strong:#6d7cff;--owner-line:#30404c;--owner-panel:#10171c}
/* Final owner typography authority. Legacy feature layers may define layout, but not unreadable type or legacy neon action emphasis. */
body .panel{border-color:var(--owner-line)!important;background:linear-gradient(180deg,#12191f,#0e1419)!important}
body .panel h2{font-size:17px!important;line-height:1.4!important}
body .panel h3{font-size:15px!important;line-height:1.45!important}
body .muted,body .state{font-size:13px!important;line-height:1.65!important}
body .note,body .dangerBox{font-size:13px!important;line-height:1.65!important}
body .item{padding:12px!important;border-color:#2d3c47!important}
body .item b{font-size:14px!important;line-height:1.5!important}
body .item small{font-size:12px!important;line-height:1.6!important}
body .chip{font-size:12px!important;line-height:1.35!important;padding:5px 8px!important}
body .btn{font-size:14px!important;min-height:var(--owner-touch)!important}
body .field,body #customers input,body #customers textarea,body #customers select,body #governance input,body #governance textarea,body #governance select{font-size:16px!important;line-height:1.45!important}
body .btn.primary,body .ownerLeadTab29[aria-selected="true"],body #nav [data-owner-active="true"],body .ownerSupportCta,body .ownerMissionBtn.primary{background:var(--owner-accent)!important;border-color:var(--owner-accent)!important;color:#fff!important}
body .btn.primary:focus-visible,body .ownerLeadTab29:focus-visible,body .ownerMainTab29:focus-visible,body .ownerSupportCta:focus-visible{outline:3px solid #91a0ff!important;outline-offset:3px!important}
#customers .panel{padding:14px!important;margin-bottom:12px!important}
#customers .row.mobileStack{gap:9px!important}
#customerStatus,#customerState,#supportState,#oc20State{min-height:22px!important;font-size:13px!important;line-height:1.65!important}
#customerResults{gap:9px!important}
.oc10state,.pcRecoveryResult,.pcAccount small,.pcMetric span,.pcCount span{font-size:12px!important;line-height:1.55!important}
.pcAccount b,.pcCount b{font-size:14px!important}.pcMetric strong{font-size:22px!important}
#ownerExecutiveV23 .oc23head h2{font-size:20px!important;line-height:1.35!important}
#ownerExecutiveV23 .oc23head p{font-size:14px!important;line-height:1.7!important}
#ownerExecutiveV23 .oc23stamp{font-size:12px!important;line-height:1.5!important}
#ownerExecutiveV23 .oc23pulse{font-size:12px!important;min-height:30px!important;padding:5px 9px!important}
#ownerExecutiveV23 .oc23card h3,#ownerExecutiveV23 .oc23panel h3{font-size:15px!important;line-height:1.4!important}
#ownerExecutiveV23 .oc23big{font-size:24px!important;line-height:1.15!important}
#ownerExecutiveV23 .oc23sub{font-size:13px!important;line-height:1.65!important}
#ownerExecutiveV23 .oc23metric{padding:8px!important}
#ownerExecutiveV23 .oc23metric span{font-size:12px!important;line-height:1.5!important}
#ownerExecutiveV23 .oc23metric b{font-size:14px!important;line-height:1.4!important}
#ownerExecutiveV23 .oc23row{font-size:13px!important;line-height:1.55!important;padding:7px 0!important}
#ownerExecutiveV23 .oc23health b{font-size:18px!important}
#ownerExecutiveV23 .oc23health small{font-size:12px!important}
#ownerExecutiveV23 .oc23item{font-size:13px!important;line-height:1.65!important;padding:9px!important}
#ownerExecutiveV23 .oc23item strong{font-size:14px!important;line-height:1.5!important}
#ownerExecutiveV23 .oc23tag{font-size:12px!important;line-height:1.4!important;padding:3px 7px!important}
#ownerExecutiveV23 .oc23note{font-size:13px!important;line-height:1.7!important;padding:9px!important}
#ownerExecutiveV23 .oc23loading{font-size:14px!important;line-height:1.6!important}
#ownerExecutiveV23 .oc23stage{font-size:12px!important;line-height:1.55!important;padding:8px!important}
#ownerExecutiveV23 .oc23stage b{font-size:13px!important;line-height:1.5!important}
.ownerLeadTab29,.nav .ownerMainTab29{font-size:14px!important;min-height:var(--owner-touch)!important}
.ownerMissionFieldLabel,.ownerMissionCounter,.ownerMissionDueHint{font-size:13px!important;line-height:1.55!important}
#ownerCeoMissionControl input,#ownerCeoMissionControl textarea,#ownerCeoMissionControl select,#ownerCeoMissionControl button{font-size:14px!important}
@media(max-width:760px){
 body .shell{padding-inline:max(12px,env(safe-area-inset-left)) max(12px,env(safe-area-inset-right))!important}
 body .panel{border-radius:14px!important;padding:12px!important}
 body .panel h2{font-size:16px!important}
 body .panel h3{font-size:14px!important}
 body .muted,body .state,body .note,body .dangerBox{font-size:13px!important}
 body .item b{font-size:14px!important}body .item small{font-size:12.5px!important}
 body .btn{width:100%;min-height:48px!important;font-size:14px!important}
 body .row:not(.itemActions):not(.ownerDecisionActions){gap:8px!important}
 #customers .hero p{display:block!important;-webkit-line-clamp:unset!important;overflow:visible!important;font-size:13px!important}
 #customers .panel{padding:12px!important}
 #customers .row.mobileStack{display:grid!important;grid-template-columns:1fr!important;align-items:stretch!important}
 #customerQuery,#homeSearch{width:100%!important;min-width:0!important}
 #customerSearch,#homeSearchBtn{width:100%!important}
 #ownerExecutiveV23 .oc23{padding:12px!important}
 #ownerExecutiveV23 .oc23metrics{gap:7px!important}
 body #nav a,body #nav .ownerMainTab29{font-size:13.5px!important;min-height:48px!important}
 .ownerLeadTab29{font-size:13.5px!important;min-height:48px!important}
}
@media(max-width:390px){
 body .shell{padding-inline:10px!important}
 body .panel{padding:11px!important}
 #ownerExecutiveV23 .oc23head h2{font-size:18px!important}
 #ownerExecutiveV23 .oc23big{font-size:22px!important}
 #ownerExecutiveV23 .oc23metric span{font-size:12px!important}
 #ownerExecutiveV23 .oc23metric b{font-size:14px!important}
}
</style>`;
