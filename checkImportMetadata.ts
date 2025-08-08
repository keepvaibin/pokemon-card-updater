import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("🗃️ Fetching all import metadata records...");
    const allImports = await prisma.importMetadata.findMany({
      orderBy: { importedAt: "desc" },
    });

    if (allImports.length === 0) {
      console.log("No import metadata records found.");
    } else {
      allImports.forEach((record, idx) => {
        console.log(
          `${idx + 1}: id=${record.id}, isFullImport=${record.isFullImport}, totalCount=${record.totalCount}, importedAt=${record.importedAt}`
        );
      });
    }

    console.log("\n✅ Fetching most recent full import...");
    const fullImport = await prisma.importMetadata.findFirst({
      where: { isFullImport: true },
      orderBy: { importedAt: "desc" },
    });

    if (fullImport) {
      console.log(
        `Most recent full import: id=${fullImport.id}, totalCount=${fullImport.totalCount}, importedAt=${fullImport.importedAt}`
      );
    } else {
      console.log("No full import found.");
    }

    console.log("\n🕒 Fetching last import entry overall...");
    const lastImport = await prisma.importMetadata.findFirst({
      orderBy: { importedAt: "desc" },
    });

    if (lastImport) {
      console.log(
        `Last import entry: id=${lastImport.id}, isFullImport=${lastImport.isFullImport}, totalCount=${lastImport.totalCount}, importedAt=${lastImport.importedAt}`
      );
    } else {
      console.log("No imports found.");
    }

    // Uncomment the following lines if you want to delete all importMetadata records:
    
    console.log("\n🧹 Deleting all importMetadata records...");
    await prisma.importMetadata.deleteMany({});
    console.log("All importMetadata records deleted.");
    

  } catch (error) {
    console.error("Error during checking import metadata:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
