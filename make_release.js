const core = require("@actions/core");
const github = require("@actions/github");
const exec = require("@actions/exec");
const fetch = require("node-fetch");
const BASE_URL = "https://api.tracker.yandex.net/v2/issues";

async function makeRelease() {
  try {
    const { OAUTH_TOKEN, ORG_ID, TICKET_ID } = process.env;
    const URL_TICKET = `${BASE_URL}/${TICKET_ID}`;

    const refs = github.context.ref.split("/");
    const newReleaseNumber = getReleaseNumber(refs[refs.length - 1]);
    const oldReleaseNumber = getOldReleaseNumber(newReleaseNumber);

    const releases =
      Number(newReleaseNumber) === 1
        ? `rc-0.0.${newReleaseNumber}`
        : `rc-0.0.${newReleaseNumber}...rc-0.0.${oldReleaseNumber}`;

    const logForCommit = await getResultCommand("git", [
      "log",
      '--pretty=format:"%h %an %s"',
      releases,
    ]);

    const beautifulCommitLogs = logForCommit
      .split("\n")
      .map((log) => log.replace(/"/g, ""))
      .join("\n");

    const bodyText = JSON.stringify({
      summary: getTitle(
        `0.0.${newReleaseNumber}`,
        new Date().toLocaleDateString()
      ),
      description: getDescriptions(
        github.context.payload.pusher.name,
        beautifulCommitLogs
      ),
    });

    console.log("Пошел запрос на изменения тикета");
    await fetch(URL_TICKET, {
      method: "PATCH",
      headers: getHeaders(OAUTH_TOKEN, ORG_ID),
      body: bodyText,
    });
    console.log("Запрос на изменения тикета завершен");

    const dockerCodeExec = await exec.exec("docker", [
      "build",
      "-t",
      `app:0.0.${newReleaseNumber}`,
      ".",
    ]);

    if (dockerCodeExec !== 0) {
      throw new Error("fail build docker image");
    }

    console.log("Пошел запрос на добавление комментария");
    await fetch(`${BASE_URL}/${TICKET_ID}/comments`, {
      method: "POST",
      headers: getHeaders(OAUTH_TOKEN, ORG_ID),
      body: JSON.stringify({
        text: getComment(`rc-0.0.${newReleaseNumber}`),
      }),
    });
    console.log("Запрос на добавление комментария завершен");
  } catch (error) {
    core.setFailed(error.message);
  }
}

makeRelease();

async function getResultCommand(command, args) {
  let result = "";
  let resultError = "";

  await exec.exec(command, args, {
    listeners: {
      stdout: (data) => {
        result += data.toString();
      },
      stderr: (data) => {
        resultError += data.toString();
      },
    },
  });

  if (resultError !== "") {
    throw new Error(resultError);
  }

  console.log("ResultCommand: " + result);

  return result;
}

function getReleaseNumber(currentTag) {
  const tagInfo = currentTag.split("-");
  const tagNumber = tagInfo[tagInfo.length - 1].split(".");
  console.log(
    "Получили текущий номер тега: " + tagNumber[tagNumber.length - 1]
  );
  return tagNumber[tagNumber.length - 1];
}

function getOldReleaseNumber(currentReleaseNumber) {
  console.log(
    "Получили прошлый номер тега: " + Number(currentReleaseNumber) - 1
  );
  return Number(currentReleaseNumber) - 1;
}

function getHeaders(oauthToken, orgId) {
  return {
    Authorization: `OAuth ${oauthToken}`,
    "X-Org-ID": orgId,
  };
}

function getDescriptions(authorName, commits) {
  console.log(
    `Ответственный за релиз ${authorName}\n\nКоммиты, попавшие в релиз:\n${commits}`
  );
  return `Ответственный за релиз ${authorName}\n\nКоммиты, попавшие в релиз:\n${commits}`;
}

function getTitle(releaseNumber, date) {
  console.log(`Релиз №${releaseNumber} от ${date}`);
  return `Релиз №${releaseNumber} от ${date}`;
}

function getComment(releaseTag) {
  console.log(`Собрали образ с тегом ${releaseTag}`);
  return `Собрали образ с тегом ${releaseTag}`;
}
