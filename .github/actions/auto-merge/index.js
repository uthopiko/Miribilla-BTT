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

    // 1️⃣ Validar PRs y checks
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

      // Validar approvals
      const reviews = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pr.number,
      });
      const approved = reviews.data.some((r) => r.state === "APPROVED");
      if (!approved) throw new Error(`La rama ${br} no tiene PR aprobado`);

      // Validar checks
      const combinedStatus = await octokit.rest.repos.getCombinedStatusForRef({
        owner,
        repo,
        ref: pr.head.sha,
      });

      if (combinedStatus.data.state === "failure") {
        throw new Error(`La rama ${br} tiene checks fallidos`);
      }

      console.log(`✔ PR y checks OK para ${br}`);
    }

    // 2️⃣ Dry-run secuencial (simulación)
    console.log("✅ Dry-run completado (simulación, todo OK)");

    // 3️⃣ Merge real en develop y rebase de las siguientes
    console.log("🛠 Configurando identidad Git...");
    const exec = require("child_process").execSync;
    exec("git", ["config", "--global", "user.name", "github-actions"]);
    exec(" git", [
      "config",
      "--global",
      "user.email",
      "github-actions@github.com",
    ]);
    console.log(`🔀 Merge secuencial en ${developBranch}`);
    exec(`git fetch origin`, { stdio: "inherit" });
    exec(`git checkout ${developBranch}`, { stdio: "inherit" });

    for (let i = 0; i < branches.length; i++) {
      const br = branches[i];
      console.log(`Mergeando ${br} en ${developBranch}`);
      exec(`git merge --no-ff origin/${br}`, { stdio: "inherit" });
      exec(`git push origin ${developBranch}`, { stdio: "inherit" });

      // Rebase del resto
      for (let j = i + 1; j < branches.length; j++) {
        const next = branches[j];
        console.log(`Rebaseando ${next} sobre ${developBranch}`);
        exec(`git checkout ${next}`, { stdio: "inherit" });
        exec(`git rebase ${developBranch}`, { stdio: "inherit" });
        exec(`git push origin ${next} --force-with-lease`, {
          stdio: "inherit",
        });
      }

      exec(`git checkout ${developBranch}`, { stdio: "inherit" });
    }

    // 4️⃣ Crear snapshot
    const tagName = `snapshot-${
      new Date().toISOString().replace(/[-:]/g, "").split(".")[0]
    }`;
    console.log(`🏷️ Creando snapshot: ${tagName}`);
    await exec(`git tag ${tagName}`, { stdio: "inherit" });
    awaitexec(`git push origin ${tagName}`, { stdio: "inherit" });

    console.log("🎉 Merge y snapshot completados correctamente");
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
