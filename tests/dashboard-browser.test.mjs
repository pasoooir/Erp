import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const mime={".html":"text/html; charset=utf-8",".json":"application/json; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
let server,browser,baseUrl;
test("dashboard renders, searches, filters, shows detail, exports CSV and remains RTL on mobile",async t=>{
  server=http.createServer((req,res)=>{
    const url=new URL(req.url,"http://127.0.0.1");
    if(url.pathname==="/broken/erp-project.json"){res.writeHead(404);res.end("not found");return;}
    const clean=url.pathname.replace(/^\/broken(?=\/)/,"");
    const relative=clean==="/"?"Gonchar.html":clean.replace(/^\//,"");
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)&&file!==path.join(root,"Gonchar.html")){res.writeHead(403);res.end();return;}
    fs.readFile(file,(error,data)=>{
      if(error){res.writeHead(404);res.end("not found");return;}
      res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream"});
      res.end(data);
    });
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  baseUrl=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
  t.after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
  const pageErrors=[];page.on("pageerror",e=>pageErrors.push(e.message));
  await page.goto(baseUrl+"/Gonchar.html");
  await page.waitForFunction(()=>document.querySelector("#s1")?.textContent!=="—");
  assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
  assert.equal(await page.locator("html").getAttribute("lang"),"fa");
  assert.notEqual(await page.locator("#s1").textContent(),"—");
  assert.match(await page.locator("#overallText").textContent(),/پیشرفت کل/);
  await page.locator("#search").fill("GOV-ORG-A-T1-DATA-T1");
  const result=page.locator("#results [data-result='GOV-ORG-A-T1-DATA-T1']");
  await result.waitFor();
  await result.click();
  await page.locator("#detail").getByText("GOV-ORG-A-T1-DATA-T1").waitFor();
  const prLink=page.locator("#detail a").filter({hasText:"Pull Request"});
  await prLink.waitFor();
  assert.equal(await prLink.getAttribute("href"),"https://github.com/pasoooir/Erp/pull/3");
  const commitLink=page.locator("#detail a").filter({hasText:"Commit"});
  await commitLink.waitFor();
  assert.match(await commitLink.getAttribute("href"),/598cf373faef6cc15d3e6c9191a0bbe00cbd9046/);
  await page.locator("#detail").getByText(/CI 40712695255 passed/).waitFor();
  await page.locator("#search").fill("");
  await page.locator("#levelFilter").selectOption("6");
  assert.equal(await page.locator("#results [data-result]").count(),250);
  await page.locator("#statusFilter").selectOption("not_started");
  assert.ok(await page.locator("#results [data-result]").count()>0);
  const downloadPromise=page.waitForEvent("download");
  await page.locator("#exportCsv").click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),"erp-gantt-filtered.csv");
  const stream=await download.createReadStream();
  const chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const csv=Buffer.concat(chunks).toString("utf8");
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv,/شناسه,نام,سطح/);
  await page.setViewportSize({width:390,height:844});
  const columns=await page.locator(".controls").evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
  assert.equal(columns,1);
  const errorPage=await browser.newPage();
  await errorPage.goto(baseUrl+"/broken/Gonchar.html");
  await errorPage.getByText(/فایل erp-project\.json بارگذاری نشد/).waitFor();
  await errorPage.close();
  assert.deepEqual(pageErrors,[]);
});
