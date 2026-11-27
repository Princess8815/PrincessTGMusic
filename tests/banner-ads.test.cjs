const assert=require("node:assert/strict");
(async()=>{
 const {showTestBanner,showAdminTestBanner,bannerPage,PRODUCTION_ORIGIN,AD_CLIENT,AD_SLOT}=await import("../script/banner-ads-core.mjs");
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
 for(const path of ["/pages/health.html","/pages/admin.html","/pages/profile.html","/pages/survey-transgender-attitudes.html","/pages/store.html","/pages/orange-knock-down.html","/404.html"])assert.equal(show(free,preview,path),false,path);
 assert.equal(AD_CLIENT,"ca-pub-9671323559975419");assert.equal(AD_SLOT,"8870216368");
 console.log("Banner test assertions passed");
})().catch(error=>{console.error(error);process.exitCode=1;});
