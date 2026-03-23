# "service--backup" and "service--db-main" must have the same version of the "postgres" image.
FROM postgres:18.3-alpine

RUN apk update &&\
    apk add nodejs npm openssh-keygen

ARG APP_DIR

WORKDIR ${APP_DIR}

COPY package.json package-lock.json ./
RUN npm i

COPY . .