-- CreateTable
CREATE TABLE "VisibilityDistance" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "VisibilityDistance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficDensity" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "TrafficDensity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficSpeed" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "TrafficSpeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AngleVision" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "AngleVision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClutterBillboard" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "ClutterBillboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClutterFormat" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "ClutterFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProximityCompetition" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "ProximityCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedestrianTraffic" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "PedestrianTraffic_pkey" PRIMARY KEY ("id")
);
