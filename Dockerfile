FROM node:16.16.0

WORKDIR /usr/src/app

COPY . .

RUN npm ci
RUN npm run build

EXPOSE 3000

CMD [ "npm", "run", "serve" ]
