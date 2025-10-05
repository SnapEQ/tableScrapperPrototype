import axios from "axios";
import https from "node:https";
import fs from "node:fs";
import { spawn } from "node:child_process";
import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process";

const course_ids = {
	"1ABIOM - group 1" : 259,
	"1ABIOM - group 2" : 2949,
	"1BET - group 1": 241,
	"1BS - group 1": 299,
	"1BS - group 2": 295,
	"1BSTen - group 1": 220,
	"1BSTen - group 2": 221,
	"1BSTfr - group 1": 231,
	"1BSTfr - group 2": 233,
	"1CS - Erasmusm": 3006,
	"1CS - group 1": 33,
	"1CS - group 2": 44,
	"1CS - group 3": 2003,
	"1CS - group 4": 2004,
	"1ETE - group 1": 248,
	"1ETE - group 2": 245,
	"1IB - group 1": 268,
	"1IB - group 2": 262,
	"1IT - Erasmums": 3062,
	"1IT - group 1": 352,
	"1IT - group 2": 353,
	"1IT - group 3": 2724,
	"1IT - group 4": 2725,
	"1MBS Master Degree - group 1": 346,
	"1MBS Master Degree - group 1": 345,
	"1MDS - group 1": 282,
	"1MDS - group 2": 279,
	"1ME - group 1": 47,
	"1ME - group 2": 48,
	"1ME - group 3": 2722,
	"1ME - group 4": 2723,
	"1MMDA - group 1": 289,
	"1MMDA - group 2": 286
}


const rl = readline.createInterface({ input, output });
const typedName = (await rl.question('Type the exact group name (e.g. "1CS - group 1"): ')).trim();
await rl.close();

const EVENT_PARAM = course_ids[typedName];
if(!EVENT_PARAM) {
	console.error('Unknown group name: ', typedName);
	console.log('\nAvailable groups:\n' + Object.keys(course_ids).join('\n'));
	process.exit(1);
}

console.log(`[i] Selected group: ${typedName} (id=${EVENT_PARAM})`);


const httpsAgent = new https.Agent({
	ca: fs.readFileSync("./celcat-chain.pem", "utf8"), //For now you need to name the certificate file like "celcat-chain.pem"
});

const options = {
	method: "get",
	url: `https://lodz.celcat.cloud/cal/events?${EVENT_PARAM}=1001`,
	headers: {
		Accept: "application/json, text/plain, */*",
		"Accept-Language": "en-US,en;q=0.9,pl;q=0.8",
		Cookie:
			"ApplicationGatewayAffinityCORS=48ec909fc6a0a45ff6243a56fa8382a4; ApplicationGatewayAffinity=48ec909fc6a0a45ff6243a56fa8382a4; Celcat.Calendar.Session=CfDJ8LJVpLw3T51Mo7eDzJnTldPjceLUmetBoErn5VPAbS56IWY6NEqJ864RlUJl4c77PKUXjafJ9BmVP9ZfodQXkeLF1epXAqwvuMDbE%2FaDLJwZSaOeSR2u831dPkw%2BU9qIJxnNzOXDp7a%2FLpvGbRiCKfqNnUxJH74zYIezzI2p%2B53Q",
		Priority: "u=1,i",
		Referer:
			"https://lodz.celcat.cloud/cal/?r=CyGg&v=grid&z=1&w=1&dt=1759708800000&dta=175970880000",
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
	},
	httpsAgent,
};

function previewFirstLines(data, lines = 20) {
	let text;
	if (typeof data === "string") {
		text = data;
	} else if (Buffer.isBuffer(data)) {
		text = data.toString("utf8");
	} else {
		text = JSON.stringify(data, null, 2);
	}
	const firstLines = text.split(/\r?\n/).slice(0, lines).join("\n");
	// console.log(firstLines);
	return {
		text,
		isJson: typeof data === "object" && !Buffer.isBuffer(data) && data !== null,
	};
}

try {



	const res = await axios(options);

	console.log("\n", "[#] Status: ", res.status, "\n");

	const { text, isJson } = previewFirstLines(res.data, 20);

	fs.writeFileSync(
		"data.json",
		isJson ? JSON.stringify(res.data, null, 2) : text,
		"utf8"
	);

	console.log("\n", "[#] Done writing JSON");

	if (isJson && res.data && res.data.events && res.data.names) {
		await runPythonScript("script.py", ["data.json", "timetable.ics"]);
		console.log("[#] Python script completed");
	} else {
		console.warn("[#] Skipping Python: response is not a valid CELCAT JSON,");
	}
} catch (err) {
	console.error("Request failed", err.message);
}

async function runPythonScript(script, args = []) {
	const pythonCmd = "python"; //Change this to your pythonCmd if different
	const baseArgs = [];
	const child = spawn(pythonCmd, [...baseArgs, script, ...args], {
		cwd: process.cwd(),
		stdio: "inherit",
		shell: false,
	});
	await new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("exit", code =>
			code === 0 ? resolve() : reject(new Error(`Python exited ${code}`))
		);
	});
}
