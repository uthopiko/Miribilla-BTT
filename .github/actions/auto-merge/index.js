const core = require("@actions/core");
const github = require("@actions/github");
const exec = require("@actions/exec");

async function run() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN no definido");

    const branchesInput = core.getInput("branches", { required: true });
    const developBranch = core.getInput("develop-branch") || "main";
    const branches = branchesInput.split(",").map((b) => b.trim());

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    console.log("Ramas a procesar:", branches);

    // 1️⃣ Validación de PRs + checks
    for (const br of branches) {
      console.log(`Validando PR para ${br}...`);

      const prs = await octokit.rest.pulls.list({
        owner,
        repo,
        head: `${owner}:${br}`,
        state: "open",
      });

      if (prs.data.length === 0)
        throw new Error(`No hay PR abierto para ${br}`);

      const pr = prs.data[0];

      // Aprobaciones
      const reviews = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pr.number,
      });
      const approved = reviews.data.some((r) => r.state === "APPROVED");
      if (!approved) throw new Error(`La rama ${br} no tiene PR aprobado`);

      // Checks
      const combinedStatus = await octokit.rest.repos.getCombinedStatusForRef({
        owner,
        repo,
        ref: pr.head.sha,
      });

      if (combinedStatus.data.state === "failure")
        throw new Error(`La rama ${br} tiene checks fallidos`);

      console.log(`✔ PR y checks OK para ${br}`);
    }

    console.log("✅ Dry-run completado (simulación, todo OK)");

    // 2️⃣ Configurar identidad Git
    console.log("🛠 Configurando identidad Git...");
    await exec.exec("git", [
      "config",
      "--global",
      "user.name",
      "github-actions",
    ]);
    await exec.exec("git", [
      "config",
      "--global",
      "user.email",
      "github-actions@github.com",
    ]);

    // 3️⃣ Rebase + fast-forward merge limpio en develop
    console.log(`🔀 Integración lineal en ${developBranch}`);

    await exec.exec("git", ["fetch", "origin"]);
    await exec.exec("git", ["checkout", developBranch]);
    await exec.exec("git", ["pull", "origin", developBranch]);

    for (const br of branches) {
      console.log(`🔄 Rebasando ${br} sobre ${developBranch}...`);

      // Rama temporal para rebase
      await exec.exec("git", ["checkout", "-b", `tmp-${br}`, `origin/${br}`]);

      // Rebase limpio
      await exec.exec("git", ["rebase", developBranch]);

      console.log(`📌 Fast-forward merge de ${br} en ${developBranch}...`);

      await exec.exec("git", ["checkout", developBranch]);
      await exec.exec("git", ["merge", "--ff-only", `tmp-${br}`]);

      await exec.exec("git", ["push", "origin", developBranch]);
    }

    // 4️⃣ Snapshot
    const tagName = `snapshot-${
      new Date().toISOString().replace(/[-:]/g, "").split(".")[0]
    }`;
    console.log(`🏷️ Creando snapshot: ${tagName}`);

    await exec.exec("git", ["tag", tagName]);
    await exec.exec("git", ["push", "origin", tagName]);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
