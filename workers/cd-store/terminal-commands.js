const TEST="--config workers/cd-store/wrangler.toml",LIVE="--config workers/cd-store/wrangler.live.toml";
const command=(id,category,title,description,code,environment="")=>({id,category,title,description,command:code,environment});
const migration=(mode,config)=>["0001_refund_sync","0002_shipping_quotes","0003_merchandise","0004_inventory"].map(name=>"npx wrangler d1 execute princesstg-cd-orders"+(mode==="live"?"-live":"")+" "+config+" --remote --file workers/cd-store/migrations/"+name+".sql").join("\n");
export const TERMINAL_COMMANDS=Object.freeze([
 command("deploy-both","Deploy","Deploy both Workers","After changing Worker code or its shared modules.","npx wrangler deploy "+TEST+"\nnpx wrangler deploy "+LIVE,"Live & test"),
 command("deploy-test","Deploy","Deploy test Worker","Update the service used by local and preview pages.","npx wrangler deploy "+TEST,"Test"),
 command("deploy-live","Deploy","Deploy live Worker","Update the service used by the live site.","npx wrangler deploy "+LIVE,"Live"),
 command("login","Setup","Sign in to deployment tools","Opens the sign-in flow in your browser.","npx wrangler login"),
 command("whoami","Setup","Check deployment account","Show the account currently signed in.","npx wrangler whoami"),
 command("versions","Setup","Check installed tools","Show Node, npm and Java versions. Local services need Java 21 or later.","node --version\nnpm --version\njava -version"),
 command("root","Git","Find the project root","Print the full path to PrincessTGMusic.","git rev-parse --show-toplevel"),
 command("status","Git","Check local changes","Review changed files before switching branches or pulling.","git status --short"),
 command("branch","Git","Check current branch","Show which branch this terminal is using.","git branch --show-current"),
 command("fetch","Git","Fetch branch updates","Download remote branch information.","git fetch origin"),
 command("pull","Git","Pull current branch","Get updates for the current branch; stops if a merge would be needed.","git pull --ff-only"),
 command("main","Git","Switch to main","Use after your pull request is merged.","git switch main\ngit pull --ff-only"),
 command("push","Git","Push committed changes","Send commits on the current tracking branch.","git push"),
 command("build","Local testing","Build the site","Rebuild the generated dist folder.","node build-site.cjs cloudflare"),
 command("preview","Local testing","Preview the built site","Open http://127.0.0.1:5501 after building. Keep this terminal open; Ctrl+C stops it.","npx http-server dist -a 127.0.0.1 -p 5501 -c-1","Local"),
 command("emulators","Local testing","Start local account and database services","Use a separate terminal for your local preview. Ctrl+C stops these services.","npx firebase-tools emulators:start --only auth,firestore --project demo-princesstg","Local"),
 command("tests","Checks & logs","Run all automated tests","Check the site and Worker tests.","node --test"),
 command("tail-test","Checks & logs","Watch test Worker logs","Leave open, retry the failed action, then read the result. Ctrl+C stops logging.","npx wrangler tail "+TEST,"Test"),
 command("tail-live","Checks & logs","Watch live Worker logs","Show live service logs. Ctrl+C stops logging.","npx wrangler tail "+LIVE,"Live"),
 command("secrets-test","Checks & logs","List test setting names","Shows private setting names, without revealing their values.","npx wrangler secret list "+TEST,"Test"),
 command("secrets-live","Checks & logs","List live setting names","Shows private setting names, without revealing their values.","npx wrangler secret list "+LIVE,"Live"),
 command("survey-check","Checks & logs","Check the test survey route","An expected PTG-007 response confirms the route is running. No answers are submitted.",'curl.exe -i -X POST "https://princesstg-cd-store.transgirl1991.workers.dev/surveys/submit" -H "Origin: http://127.0.0.1:5501" -H "Content-Type: application/json" --data "{}"',"Test · Windows"),
 command("rules","Database setup","Publish account and survey rules","After reviewing changes to security/firestore.rules.","npx firebase-tools deploy --only firestore:rules --project music-and-poetry","Live"),
 command("db-test","Database setup","Create test store tables","Initial setup of the existing test store database.","npx wrangler d1 execute princesstg-cd-orders "+TEST+" --remote --file workers/cd-store/schema.sql","Test"),
 command("db-live","Database setup","Create live store tables","Initial setup of the existing live store database.","npx wrangler d1 execute princesstg-cd-orders-live "+LIVE+" --remote --file workers/cd-store/schema.sql","Live"),
 command("migrations-test","Database setup","Apply test store migrations","Apply the checked-in refund, shipping, merchandise and inventory updates in order.",migration("test",TEST),"Test"),
 command("migrations-live","Database setup","Apply live store migrations","Apply the checked-in refund, shipping, merchandise and inventory updates in order.",migration("live",LIVE),"Live"),
 command("audio-index","Music","Refresh the audio index","After adding or removing local audio files.","node generate-audio-index.js"),
 command("legacy","Site build","Build legacy redirects","Replaces dist with redirect pages for the old site.","node build-site.cjs legacy")
]);
