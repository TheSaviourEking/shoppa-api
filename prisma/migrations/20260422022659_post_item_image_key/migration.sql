/*
  Warnings:

  - You are about to drop the column `qty` on the `post_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "post_items" DROP COLUMN "qty",
ADD COLUMN     "imageKey" VARCHAR(255);
