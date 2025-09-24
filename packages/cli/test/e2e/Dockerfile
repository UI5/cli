FROM node:current-slim

WORKDIR /home/node/e2e/ui5-cli

COPY . .
RUN test/e2e/npm-pack-production.sh

WORKDIR /home/node/e2e/test

CMD ["/bin/bash", "/home/node/e2e/ui5-cli/test/e2e/test.sh"]
