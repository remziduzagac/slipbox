# The photo site, built and served: Astro builds it, nginx serves what it built.
# What the site is for: index.md, "Gear" and "Walks".
FROM node:22-alpine AS build
WORKDIR /site
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build \
    && echo "built"

FROM nginx:1.27-alpine
COPY --from=build /site/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
