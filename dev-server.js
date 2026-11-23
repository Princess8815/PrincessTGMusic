#!/usr/bin/env node
"use strict";

// PrincessTG local static server with a real HTTP 404 response.
// No npm packages, Firebase CLI, or emulator processes are required.
// Usage: node dev-server.js [port] (defaults to 5502, leaving VS Code Live Server's 5501 free).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {URL} = require("node:url");

const ROOT = path.resolve(__dirname);
const SITE_PREFIX = "/PrincessTGMusic";
const PORT = Number(process.argv[2] || process.env.PORT || 5502);
const HOST = "127.0.0.1";
const MIME = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".mjs":"text/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".txt":"text/plain; charset=utf-8",
  ".svg":"image/svg+xml",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".webp":"image/webp",
  ".gif":"image/gif",
  ".ico":"image/x-icon",
  ".mp3":"audio/mpeg",
  ".wav":"audio/wav",
  ".m4a":"audio/mp4",
  ".ogg":"audio/ogg",
  ".mp4":"video/mp4",
  ".webm":"video/webm",
  ".pdf":"application/pdf",
  ".woff":"font/woff",
  ".woff2":"font/woff2",
  ".webmanifest":"application/manifest+json"
};

function sendText(res, method, status, value){
  const body=Buffer.from(value,"utf8");
  res.writeHead(status,{
    "Content-Type":"text/plain; charset=utf-8",
    "Content-Length":body.length,
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff"
  });
  res.end(method==="HEAD"?undefined:body);
}

function sendFile(req,res,file,stats,status=200){
  const type=MIME[path.extname(file).toLowerCase()]||"application/octet-stream";
  const headers={
    "Content-Type":type,
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Accept-Ranges":"bytes"
  };
  let start=0,end=stats.size-1;
  const range=req.headers.range;
  if(status===200&&range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if(!match||(match[1]===""&&match[2]==="")){
      res.writeHead(416,{...headers,"Content-Range":`bytes */${stats.size}`});
      res.end();return;
    }
    if(match[1]===""){
      const suffix=Number(match[2]);
      if(!Number.isSafeInteger(suffix)||suffix<=0){
        res.writeHead(416,{...headers,"Content-Range":`bytes */${stats.size}`});
        res.end();return;
      }
      start=Math.max(0,stats.size-suffix);
    }else{
      start=Number(match[1]);
      if(match[2]!=="")end=Number(match[2]);
    }
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
       start>=stats.size||end<start||end<0){
      res.writeHead(416,{...headers,"Content-Range":`bytes */${stats.size}`});
      res.end();return;
    }
    end=Math.min(end,stats.size-1);
    status=206;
    headers["Content-Range"]=`bytes ${start}-${end}/${stats.size}`;
  }
  headers["Content-Length"]=Math.max(0,end-start+1);
  res.writeHead(status,headers);
  if(req.method==="HEAD"||stats.size===0){res.end();return;}
  const stream=fs.createReadStream(file,{start,end});
  stream.on("error",err=>{
    console.error("Failed to stream",file,err);
    res.destroy(err);
  });
  stream.pipe(res);
}

async function show404(req,res){
  try{
    const file=path.join(ROOT,"404.html");
    const stats=await fs.promises.stat(file);
    if(!stats.isFile())throw Error("404.html is not a file");
    sendFile(req,res,file,stats,404);
  }catch(error){
    sendText(res,req.method,404,"404 Not Found. Return to /");
  }
}

async function handle(req,res){
  if(!["GET","HEAD"].includes(req.method)){
    sendText(res,req.method,405,"Method not allowed");return;
  }
  let pathname;
  try{
    pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  }catch{
    sendText(res,req.method,400,"Malformed URL");return;
  }
  // Accept both the root dev URL and GitHub Pages' /PrincessTGMusic/ prefix.
  if(pathname===SITE_PREFIX)pathname="/";
  else if(pathname.startsWith(SITE_PREFIX+"/"))
    pathname=pathname.slice(SITE_PREFIX.length);

  // Don't expose source-control files, credentials, server functions or logs.
  if(pathname.includes("\0")||pathname.includes("\\")||
     pathname.split("/").some(part=>part.startsWith(".")||
       ["node_modules","functions"].includes(part))||
     /\.(log|env|local|bak)$/i.test(pathname)){
    await show404(req,res);return;
  }
  const file=path.resolve(ROOT,"."+pathname);
  if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){
    await show404(req,res);return;
  }
  try{
    let target=file;
    let stats=await fs.promises.stat(target);
    if(stats.isDirectory()){
      target=path.join(target,"index.html");
      stats=await fs.promises.stat(target);
    }
    if(!stats.isFile())return await show404(req,res);
    sendFile(req,res,target,stats);
  }catch(error){
    if(["ENOENT","ENOTDIR","EACCES"].includes(error.code)){
      await show404(req,res);
    }else{
      console.error("Server error:",error);
      sendText(res,req.method,500,"Internal server error");
    }
  }
}

if(!Number.isInteger(PORT)||PORT<1||PORT>65535){
  console.error("Port must be a number from 1 to 65535.");
  process.exitCode=1;
}else{
  const server=http.createServer((req,res)=>{
    void handle(req,res).catch(error=>{
      console.error("Unexpected server error:",error);
      if(!res.headersSent)sendText(res,req.method,500,"Internal server error");
      else res.destroy();
    });
  });
  server.on("error",error=>{
    if(error.code==="EADDRINUSE")
      console.error(`Port ${PORT} is already in use. Run: node dev-server.js 5503`);
    else console.error("Could not start local server:",error);
    process.exitCode=1;
  });
  server.listen(PORT,HOST,()=>{
    console.log("");
    console.log("PrincessTG local development server");
    console.log(`  Site:        http://${HOST}:${PORT}/`);
    console.log(`  404 test:    http://${HOST}:${PORT}/this-page-does-not-exist`);
    console.log(`  Example song:http://${HOST}:${PORT}/audioPlayer/pages/song.html?id=100-voices`);
    console.log("  Missing files use the axolotl 404 page (HTTP 404).");
    console.log("  Press Ctrl+C to stop.");
    console.log("");
  });
}
