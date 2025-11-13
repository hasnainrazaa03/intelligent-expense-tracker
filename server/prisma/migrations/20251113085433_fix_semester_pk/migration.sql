/*
  Warnings:

  - The primary key for the `Semester` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `semesterUserId` to the `TuitionInstallment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "TuitionInstallment" DROP CONSTRAINT "TuitionInstallment_semesterId_fkey";

-- AlterTable
ALTER TABLE "Semester" DROP CONSTRAINT "Semester_pkey",
ADD CONSTRAINT "Semester_pkey" PRIMARY KEY ("id", "userId");

-- AlterTable
ALTER TABLE "TuitionInstallment" ADD COLUMN     "semesterUserId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "TuitionInstallment" ADD CONSTRAINT "TuitionInstallment_semesterId_semesterUserId_fkey" FOREIGN KEY ("semesterId", "semesterUserId") REFERENCES "Semester"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
