import axios from "axios";
import https from "node:https";
import fs from "node:fs";
import { spawn } from "node:child_process";

const httpsAgent = new https.Agent({
	ca: fs.readFileSync("./celcat-chain.pem", "utf8"), //For now you need to name the certificate file like "celcat-chain.pem"
});

const options = {
	method: "get",
	url: "https://lodz.celcat.cloud/cal/events?33=1001",
	headers: {
		Accept: "application/json, text/plain, */*",
		"Accept-Language": "en-US,en;q=0.9,pl;q=0.8",
		Cookie:
			"ApplicationGatewayAffinityCORS=48ec909fc6a0a45ff6243a56fa8382a4; ApplicationGatewayAffinity=48ec909fc6a0a45ff6243a56fa8382a4; Celcat.Calendar.Session=CfDJ8LJVpLw3T51Mo7eDzJnTldM0hPql1Fo0cEETGH6xIr78SV4duFXA5nMMhQ5CrHWeyFe9d8djUzb%2FVrp8eDNKJozoSZMT0dNP8LhjAv3S8vlRpV%2BRxyTodXq9h8NPjsVrNwPXx44p%2Bdml6Gpxnc6UNzfjZqKAsOJ9kU%2BGQmGLxkpa",
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
