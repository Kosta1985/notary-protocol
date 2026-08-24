const host = "notary-protocol.notary-labs.workers.dev";
const key = "5a483ec1706821edd479e66637c893e0";
const origin = `https://${host}`;
const urlList = [`${origin}/`, `${origin}/pilot.html`, `${origin}/privacy.html`, `${origin}/llms.txt`, `${origin}/openapi.json`];

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation: `${origin}/${key}.txt`, urlList })
});

console.log(`IndexNow response: ${response.status}`);
if (![200, 202].includes(response.status)) {
  console.error(await response.text());
  process.exitCode = 1;
}
