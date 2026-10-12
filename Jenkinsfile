// Jenkins mirror of the scheduled GitHub audit. Reuses the SAME scripts under
// .github/actions/dependency-audit/scripts (no audit logic is reimplemented here): audit every
// target in targets.json, print a plain-text report to the console, archive the raw results, and
// fail the build on findings via gate.mjs.
//
// Requirements on the agent: git and Node.js (>= 22.20 || >= 24, matching this monorepo). If Node
// is provided through the Jenkins NodeJS plugin, wrap the stages in `nodejs('<tool-name>') { ... }`.

def auditDir = '.github/actions/dependency-audit'
def results = 'audit-results'

pipeline {
    agent any

    triggers {
        cron('H 4 * * *') // once a day, like the scheduled GitHub workflow
    }

    options {
        timestamps()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Audit all targets') {
            steps {
                sh "node ${auditDir}/scripts/audit-all.mjs --targets ${auditDir}/targets.json --results ${results}"
            }
        }

        stage('Report') {
            steps {
                sh "node ${auditDir}/scripts/format-cli.mjs --results ${results}"
            }
        }

        stage('Gate') {
            steps {
                // Non-zero exit fails the build; the report above has already been printed.
                sh "node ${auditDir}/scripts/gate.mjs --results ${results}"
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: "${results}/**", allowEmptyArchive: true
        }
    }
}
