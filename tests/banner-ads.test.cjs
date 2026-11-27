const assert=require("node:assert/strict");
(async()=>{
 const {showTestBanner,showAdminTestBanner,bannerPage,bannerPlacement,bannerSuppressed,renderedElement,hasVisibleDialog,PRODUCTION_ORIGIN,AD_CLIENT,AD_SLOT}=await import("../script/banner-ads-core.mjs");
 const {effectiveMembership}=await import("../script/staff-membership-core.mjs");
 const preview="http://127.0.0.1:5501";
 const paid={ready:true,staff:true,uid:"owner",expiresAt:null,override:"actual"},free={...paid,override:"free"};
 const regular={...free,staff:false,uid:"regular"},guest={ready:false,uid:null};
 const status=s=>s.ready?effectiveMembership(s.expiresAt,s.override,s.staff).status:null;
 const show=(state,origin,path="/")=>showTestBanner({origin,path,state,status:state?status(state):null});
 for(const origin of [preview,PRODUCTION_ORIGIN]){assert.equal(show(paid,origin),false);assert.equal(show(free,origin),true);assert.equal(show({...free,ready:false},origin),false);assert.equal(show(null,origin),false);}
 assert.equal(showAdminTestBanner(paid,status(paid)),false);assert.equal(showAdminTestBanner(free,status(free)),true);assert.equal(showAdminTestBanner(regular,status(regular)),false);
 assert.equal(show(guest,preview),true);assert.equal(show(guest,PRODUCTION_ORIGIN),false);assert.equal(show(regular,preview),true);assert.equal(show(regular,PRODUCTION_ORIGIN),false);
 assert.equal(show({...regular,expiresAt:Date.now()+86400000},preview),false);
 for(const path of ["/","/index.html","/audioPlayer/index.html","/albums/","/pages/fruity-paradice.html","/PrincessTGMusic/index.html"])assert.equal(bannerPage(path),true,path);
 for(const path of ["/pages/health.html","/pages/admin.html","/pages/profile.html","/pages/survey-transgender-attitudes.html","/pages/research-surveys.html","/pages/docs.html","/pages/docs-board.html","/pages/settings.html","/pages/orange-level-editor.html","/pages/shiny-light-editor.html","/pages/privacy-policy.html","/pages/terms-of-service.html","/404.html","/future-unknown.html"])assert.equal(show(free,preview,path),false,path);
 for(const [path,placement] of [["/","home"],["/pages/roadmap","browse"],["/audioPlayer/pages/song.html","content"],["/albums/album.html","content"],["/arts/herobrine/chapter1.html","content"],["/pages/apple-catcher.html","game"],["/pages/cherry-empire.html","game"],["/pages/giving-tree.html","game"],["/pages/hanggirl.html","game"],["/pages/orange-knock-down.html","game"],["/pages/peach-panic.html","game"],["/pages/shiny-light.html","game"],["/pages/store.html","shop"],["/pages/membership-store.html","shop"],["/pages/star-coin-store.html","shop"],["/pages/starlight-store.html","shop"],["/pages/Accidental-Songwriters-Challenge.html","challenge"]]){
  assert.equal(bannerPlacement(path),placement,path);assert.equal(show(free,preview,path),true,path);assert.equal(show(paid,preview,path),false,path);
 }
 assert.equal(bannerSuppressed({placement:"shop",transaction:true}),true);
 assert.equal(bannerSuppressed({placement:"shop",transaction:false}),false);
 assert.equal(bannerSuppressed({placement:"challenge",formActive:true}),true);
 assert.equal(bannerSuppressed({placement:"game",dialog:true}),true);
 assert.equal(bannerSuppressed({placement:"game"}),false);
 // Auth dialog itself has no hidden attribute, but its wrapper does.
 const modal=(ancestorHidden=false,ownHidden=false,rects=1)=>({hidden:ownHidden,closest:()=>ancestorHidden?{}:null,getClientRects:()=>Array(rects)});
 const closed=modal(true),open=modal(false),cssHidden=modal(false,false,0);
 const root=(...nodes)=>({querySelectorAll:()=>nodes});
 assert.equal(renderedElement(closed),false);
 assert.equal(hasVisibleDialog(root(closed,cssHidden,modal(false,true))),false);
 assert.equal(hasVisibleDialog(root(closed,open)),true);
 assert.equal(bannerSuppressed({placement:"home",dialog:hasVisibleDialog(root(closed))}),false);
 assert.equal(bannerSuppressed({placement:"home",dialog:hasVisibleDialog(root(open))}),true);
 assert.equal(AD_CLIENT,"ca-pub-9671323559975419");assert.equal(AD_SLOT,"8870216368");
 console.log("Banner test assertions passed");
})().catch(error=>{console.error(error);process.exitCode=1;});
