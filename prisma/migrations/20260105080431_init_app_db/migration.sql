-- CreateTable
CREATE TABLE "mst_users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mst_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mst_golf_courses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mst_golf_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mst_course_layouts" (
    "id" TEXT NOT NULL,
    "golf_course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hole_count" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mst_course_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mst_holes" (
    "id" TEXT NOT NULL,
    "course_layout_id" TEXT NOT NULL,
    "hole_number" INTEGER NOT NULL,
    "par" INTEGER NOT NULL,
    "yard_regular" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mst_holes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trn_rounds" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "golf_course_id" TEXT NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trn_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trn_round_hole_results" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "hole_id" TEXT NOT NULL,
    "stroke" INTEGER NOT NULL,
    "putt" INTEGER,
    "penalty" INTEGER NOT NULL DEFAULT 0,
    "short_game" INTEGER,
    "second_shot_ok" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trn_round_hole_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mst_golf_courses_user_id_name_key" ON "mst_golf_courses"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "mst_course_layouts_golf_course_id_name_key" ON "mst_course_layouts"("golf_course_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "mst_holes_course_layout_id_hole_number_key" ON "mst_holes"("course_layout_id", "hole_number");

-- CreateIndex
CREATE UNIQUE INDEX "trn_round_hole_results_round_id_hole_id_key" ON "trn_round_hole_results"("round_id", "hole_id");

-- AddForeignKey
ALTER TABLE "mst_golf_courses" ADD CONSTRAINT "mst_golf_courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "mst_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mst_course_layouts" ADD CONSTRAINT "mst_course_layouts_golf_course_id_fkey" FOREIGN KEY ("golf_course_id") REFERENCES "mst_golf_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mst_holes" ADD CONSTRAINT "mst_holes_course_layout_id_fkey" FOREIGN KEY ("course_layout_id") REFERENCES "mst_course_layouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trn_rounds" ADD CONSTRAINT "trn_rounds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "mst_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trn_rounds" ADD CONSTRAINT "trn_rounds_golf_course_id_fkey" FOREIGN KEY ("golf_course_id") REFERENCES "mst_golf_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trn_round_hole_results" ADD CONSTRAINT "trn_round_hole_results_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "trn_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trn_round_hole_results" ADD CONSTRAINT "trn_round_hole_results_hole_id_fkey" FOREIGN KEY ("hole_id") REFERENCES "mst_holes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
