// Seeds reference data required by clinical modules (no create API exists for these).
// Run from server dir: npx tsx prisma/seed-reference.ts
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // --- Drug Master ---
  const drugs = [
    { name: "Paracetamol 500mg", genericName: "Paracetamol", category: "Analgesic", isControlled: false, unit: "strip" },
    { name: "Amoxicillin 250mg", genericName: "Amoxicillin", category: "Antibiotic", isControlled: false, unit: "strip" },
    { name: "Aspirin 75mg", genericName: "Acetylsalicylic acid", category: "Antiplatelet", isControlled: false, unit: "strip" },
    { name: "Metformin 500mg", genericName: "Metformin", category: "Antidiabetic", isControlled: false, unit: "strip" },
    { name: "Morphine 10mg", genericName: "Morphine", category: "Opioid", isControlled: true, unit: "ampoule" },
  ];
  const drugIds: string[] = [];
  for (const d of drugs) {
    const existing = await prisma.drugMaster.findUnique({ where: { name: d.name } });
    if (existing) {
      drugIds.push(existing.id);
      console.log(`drug exists: ${d.name} -> ${existing.id}`);
    } else {
      const created = await prisma.drugMaster.create({ data: d });
      drugIds.push(created.id);
      console.log(`drug created: ${d.name} -> ${created.id}`);
    }
  }

  // Drug interaction (Paracetamol <-> Aspirin) for interaction-check testing
  const existingIx = await prisma.drugInteraction.findFirst({
    where: { drugAId: drugIds[0], drugBId: drugIds[2] },
  });
  if (!existingIx) {
    await prisma.drugInteraction.create({
      data: {
        drugAId: drugIds[0],
        drugBId: drugIds[2],
        severity: "MODERATE",
        description: "Increased bleeding risk with concurrent use",
      },
    });
    console.log("drug interaction created (Paracetamol <-> Aspirin)");
  }

  // --- Lab Tests + Parameters ---
  const tests = [
    { name: "Complete Blood Count", code: "CBC", category: "Hematology", price: 300, sampleType: "Blood", parameters: [
      { name: "Hemoglobin", unit: "g/dL", referenceRangeMin: 13, referenceRangeMax: 17, criticalLow: 7, criticalHigh: 20 },
      { name: "WBC Count", unit: "10^3/uL", referenceRangeMin: 4, referenceRangeMax: 11, criticalLow: 1, criticalHigh: 40 },
      { name: "Platelet Count", unit: "10^3/uL", referenceRangeMin: 150, referenceRangeMax: 450, criticalLow: 20, criticalHigh: 1000 },
    ]},
    { name: "Blood Glucose (Fasting)", code: "GLU-F", category: "Biochemistry", price: 120, sampleType: "Blood", parameters: [
      { name: "Glucose", unit: "mg/dL", referenceRangeMin: 70, referenceRangeMax: 100, criticalLow: 40, criticalHigh: 500 },
    ]},
    { name: "Lipid Profile", code: "LIPID", category: "Biochemistry", price: 450, sampleType: "Blood", parameters: [
      { name: "Total Cholesterol", unit: "mg/dL", referenceRangeMin: 125, referenceRangeMax: 200, criticalLow: 0, criticalHigh: 400 },
      { name: "HDL", unit: "mg/dL", referenceRangeMin: 40, referenceRangeMax: 60, criticalLow: 0, criticalHigh: 120 },
    ]},
  ];
  const testIds: string[] = [];
  const paramIds: string[] = [];
  for (const t of tests) {
    let created = await prisma.labTest.findUnique({ where: { code: t.code } });
    if (!created) {
      created = await prisma.labTest.create({
        data: { name: t.name, code: t.code, category: t.category, price: t.price, sampleType: t.sampleType },
      });
      console.log(`lab test created: ${t.code} -> ${created.id}`);
    } else {
      console.log(`lab test exists: ${t.code} -> ${created.id}`);
    }
    testIds.push(created.id);
    for (const p of t.parameters) {
      const existing = await prisma.labTestParameter.findFirst({ where: { testId: created.id, name: p.name } });
      if (!existing) {
        const param = await prisma.labTestParameter.create({ data: { ...p, testId: created.id } });
        paramIds.push(param.id);
        console.log(`  param created: ${p.name} -> ${param.id}`);
      } else {
        paramIds.push(existing.id);
        console.log(`  param exists: ${p.name} -> ${existing.id}`);
      }
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log("DRUG_IDS=" + drugIds.join(","));
  console.log("TEST_IDS=" + testIds.join(","));
  console.log("PARAM_IDS=" + paramIds.join(","));
  console.log("DRUG_PARA=" + drugIds[0]);
  console.log("DRUG_AMOX=" + drugIds[1]);
  console.log("DRUG_ASPIRIN=" + drugIds[2]);
  console.log("TEST_CBC=" + testIds[0]);
  console.log("PARAM_HGB=" + paramIds[0]);
}

main()
  .catch((e) => { console.error("SEED FAILED:", e.message); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
