const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
    try {
        const token = process.env.GITHUB_TOKEN;
        if (!token) throw new Error("GITHUB_TOKEN no definido");

        const branchesInput = core.getInput('branches', { required: true });
        const developBranch = core.getInput('develop-branch') || 'develop';
        const branches = branchesInput.split(',').map(b => b.trim());

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

            if (prs.data.length === 0) throw new Error(`No hay PR abierto para ${br}`);

            const pr = prs.data[0];

            // Validar approvals
            const reviews = await octokit.rest.pulls.listReviews({ owner, repo, pull_number: pr.number });
            const approved = reviews.data.some(r => r.state === "APPROVED");
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

        // 4️⃣ Crear snapshot
        const tagName = `snapshot-${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}`;
        console.log(`🏷️ Creando snapshot: ${tagName}`);
        exec(`git tag ${tagName}`, { stdio: 'inherit' });
        exec(`git push origin ${tagName}`, { stdio: 'inherit' });

        console.log("🎉 Merge y snapshot completados correctamente");

    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
