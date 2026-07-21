import testMatrix from '../_matrix'

export default testMatrix.setupSchema(({ provider }) => {
  return /* Prisma */ `
  generator client {
    provider = "prisma-client-js"
  }

  datasource db {
    provider = "${provider}"
  }

  model Location {
    id       Int       @id @default(autoincrement())
    name     String
    position Geometry? @db.Geometry(Point, 4326)
  }

  model LocationMercator {
    id       Int       @id @default(autoincrement())
    name     String
    position Geometry? @db.Geometry(Point, 3857)
  }

  model Route {
    id   Int       @id @default(autoincrement())
    name String
    path Geometry? @db.Geometry(LineString, 4326)
  }

  model Area {
    id       Int       @id @default(autoincrement())
    name     String
    boundary Geometry? @db.Geometry(Polygon, 4326)
  }
  `
})
