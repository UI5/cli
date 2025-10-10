# Contributing to the UI5 CLI
## Content
1. [📝 **Reporting Issues**](#-reporting-issues)
2. [🤩 **Feature Requests**](#-feature-requests)
3. [🔍 **Analyzing Issues**](#-analyzing-issues)
4. [💻 **Contributing Code**](#-contributing-code)

### ⚡️ Quick Links for Maintainers
- [All Open Pull Requests](https://github.com/UI5/cli/pulls?q=is%3Aopen+is%3Apr)
- [Pull Request Queue](https://github.com/UI5/cli/pulls?q=is%3Apr+-label%3Adependencies+-label%3ARFC+is%3Aopen+no%3Aassignee+sort%3Aupdated-desc)

## 📝 Reporting Issues
### Seeking Help / Not a Bug
If you need help setting something up, or if you have questions regarding UI5 CLI, please seek help on a community platform like [StackOverflow](https://stackoverflow.com/questions/tagged/ui5-cli) or the [`#tooling`](https://openui5.slack.com/archives/C0A7QFN6B) channel of the [OpenUI5 Community Slack](https://ui5-slack-invite.cfapps.eu10.hana.ondemand.com).

### How to Report an Issue
We collect issues for all UI5 CLI packages (*ui5-cli*, *ui5-server*, *ui5-project*, *ui5-builder*, *ui5-fs*, and *ui5-logger*) in [this](https://github.com/UI5/cli) monorepo. All packages are developed and maintained within this single mono repository.

1. **Only UI5 CLI issues**
    * Please do not report:
        * Issues caused by dependencies or plugins.
        * Issues caused by the use of non-public/internal methods. Only the public methods listed in the API documentation may be used.
        * Something you do not get to work properly, see [Not a Bug / Questions](#not-a-bug--questions).
2. **No duplicate**: You have searched the [issue tracker](https://github.com/UI5/cli/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc) to make sure the bug has not already been reported.
3. **Good summary**: The summary should be specific to the issue.
4. **Current bug**: The bug can be reproduced in the most current version of the relevant module(s).
5. **Reproducible bug**: There are step-by-step instructions provided on how to reproduce the issue.
6. **Well-documented**:
    * Precisely state the expected and the actual behavior.
    * Give information about the environment in which the issue occurs (OS/Platform, Node.js version, etc.).
    * Generally, give as much additional information as possible.
8. **Only one bug per report**: Open additional tickets for additional issues.
9. **Please report bugs in English.**

We encourage you to follow the issue template that will be presented to you when creating a new issue.

When you are ready, report your issue here: https://github.com/UI5/cli/issues/new

### Reporting Security Issues

We take security issues in our projects seriously. We appreciate your efforts to responsibly disclose your findings.

Please do not report security issues directly on GitHub but using one of the channels listed below. This allows us to provide a fix before an issue can be exploited.

- **Researchers/Non-SAP Customers:** Please consult SAPs [disclosure guidelines](https://wiki.scn.sap.com/wiki/display/PSR/Disclosure+Guidelines+for+SAP+Security+Advisories) and send the related information in a PGP encrypted e-mail to secure@sap.com. Find the public PGP key [here](https://www.sap.com/dmc/policies/pgp/keyblock.txt).
- **SAP Customers:** If the security issue is not covered by a published security note, please report it by creating a customer message at https://launchpad.support.sap.com.

Please also refer to the general [SAP security information page](https://www.sap.com/about/trust-center/security/incident-management.html).

### Use of Labels
GitHub offers labels to categorize issues. The labels can only be set and modified by committers.

#### General issue types:
- **`Bug`**: This issue is a bug in the code.
- **`Feature`**: This is not a bug report, but an feature request.

#### Specific issue categories for UI5 CLI:
* **`documentation`**: This issue is about wrong documentation.
* **`needs triage`**: This issue needs to be investigated and confirmed as a valid issue that is not a duplicate
* **`module/ui5-builder`**: This issue is related to the UI5 Builder package
* **`module/ui5-cli`**: This issue is related to the UI5 CLI package
* **`module/ui5-fs`**: This issue is related to the UI5 FS package
* **`module/ui5-logger`**: This issue is related to the UI5 Logger package
* **`module/ui5-project`**: This issue is related to the UI5 Project package
* **`module/ui5-server`**: This issue is related to the UI5 Server package

##### Status of an open issue:
* **`information required`**: The author is required to provide information.
* **`good first issue`**: A newcomer may work on this.
* **`help wanted`**: Additional help in analyzing this issue is required.

##### Status/resolution of a closed issue:
* **`duplicate`**: The issue was already reported somewhere else.
* **`invalid`**: For any reason, this issue report will not be handled further. Possible reasons are lack of information, or that the issue does not apply anymore.
* **`wontfix`**: While acknowledged to be an issue, a fix cannot or will not be provided.

### Issue Reporting Disclaimer
We want to improve the quality of the UI5 CLI and good bug reports are welcome! But our capacity is limited, so we cannot handle questions or consultation requests, and we cannot afford to ask for required details.

Therefore, we reserve the right to close or to not process insufficient bug reports in favor of those which are clearly documented and easy to reproduce. Even though we would like to solve each well-documented issue, there is always the chance that it won't happen - please remember: The UI5 CLI is Open Source and comes without warranty.

Bug report analysis support is always very welcome! See [Analyze Issues](#-analyzing-issues).

## 🤩 Feature Requests
You can request most features by creating an issue in the UI5 CLI repository: https://github.com/UI5/cli/issues/new

For bigger features an RFC (Request for Comment) might be necessary. You should always clarify the need for an RFC with the project contributors upfront. You could do this either by opening an issue or in our [Slack channel](#seeking-help--not-a-bug). You can use [this template](rfcs/0000-template.md) for creating an RFC.

## 🔍 Analyzing Issues
Analyzing issue reports can be a lot of effort. Any help is welcome! 👍

Open the [Issues Page](https://github.com/UI5/cli/issues) and look for open issues which require triage, additional work, or a bugfix.  
Especially check for issues in the **`Needs Triage`** column, or for issues with the labels **`good first issue`**, **`help wanted`**, or **`information required`**.

You may be able to add additional or missing information, such as a step-by-step guide on how to reproduce an issue or an analysis of the root cause. In case of the latter, you might even be able to [contribute](#-contributing-code) a bugfix. 🙌

## 💻 Contributing Code
### General Remarks
You are welcome to contribute code to the UI5 CLI in order to fix bugs or to implement new features.

There are three important things to know:

1. You must be aware of the Apache License (which describes contributions) and **agree to the Developer Certificate of Origin***. This is common practice in major Open Source projects. To make this process as simple as possible, we are using *[CLA assistant](https://cla-assistant.io/)* for individual contributions. CLA assistant is an open source tool that integrates with GitHub very well and enables a one-click experience for accepting the DCO. For company contributers, special rules apply. See the respective section below for details.
2. Follow our **[Development Conventions and Guidelines](docs/Guidelines.md)**.
3. **Not all proposed contributions can be accepted**. Some features may just fit a third-party add-on better. The code must match the overall direction of the UI5 CLI and improve it. So there should be some "bang for the byte". For most bug fixes this is a given, but a major feature implementation first needs to be discussed with one of the committers. Possibly, one who touched the related code or module recently. The more effort you invest, the better you should clarify in advance whether the contribution will match the project's direction. The best way would be to just open an enhancement ticket in the issue tracker to discuss the feature you plan to implement (make it clear that you intend to contribute). We will then forward the proposal to the respective code owner. This avoids disappointment.

### Developer Certificate of Origin (DCO)

Due to legal reasons, contributors will be asked to accept a DCO before they submit the first pull request to this project. SAP uses [the standard DCO text of the Linux Foundation](https://developercertificate.org/).  
This happens in an automated fashion during the submission process: the CLA assistant tool will add a comment to the pull request. Click it to check the DCO, then accept it on the following screen. CLA assistant will save this decision for upcoming contributions.

This DCO replaces the previously used CLA ("Contributor License Agreement") as well as the "Corporate Contributor License Agreement" with new terms which are well-known standards and hence easier to approve by legal departments. Contributors who had already accepted the CLA in the past may be asked once to accept the new DCO.

### How to Contribute
1. Make sure the change is welcome (see [General Remarks](#general-remarks)).
    - Also check on the [UI5 CLI Issues](https://github.com/UI5/cli/issues) whether related tasks are already being worked on, blocked, or in discussion.
1. Create a branch by forking this repository and apply your change.
1. Commit and push your change on that branch.
    - 👉 **Please follow our [Development Conventions and Guidelines](docs/Guidelines.md).**
1. Create a pull request in this repository.
1. Follow the link posted by the CLA assistant to your pull request and accept it, as described above.
1. Wait for our code review and approval, possibly enhancing your change on request.
    - Note that the UI5 developers have many duties. So, depending on the required effort for reviewing, testing, and clarification, this may take a while.
1. Once the change has been approved and merged, we will inform you in a comment.
1. Celebrate! 🎉

### Multi-Branch Development
There are phases when development of a new major version of UI5 CLI has already started, but this new major version hasn't been released yet. This situation requires a special handling of pull requests / commits if the actual coding change should be both part of the current (e.g. Version 3) and the new major version (e.g. Version 4).

1. Create a pull request for the current version (e.g. Version 3) with the desired commit message header `[FEATURE]`, `[FIX]` or `[INTERNAL]`.
2. Rebase and merge the PR in the current version.
3. Cherry-pick this commit to the new major version (e.g. Version 4) and change the commit message header to `[INTERNAL]`. With this, you ensure that the coding change does not appear in the changelog of the new major version.

### Contributing with AI-generated code
As artificial intelligence evolves, AI-generated code is becoming valuable for many software projects, including open-source initiatives. While we recognize the potential benefits of incorporating AI-generated content into our open-source projects there are certain requirements that need to be reflected and adhered to when making contributions.

Please see our [guideline for AI-generated code contributions to SAP Open Source Software Projects](https://github.com/SAP/.github/blob/main/CONTRIBUTING_USING_GENAI.md) for these requirements.
