CREATE TABLE "_UserCities" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

CREATE UNIQUE INDEX "_UserCities_AB_unique" ON "_UserCities"("A", "B");
CREATE INDEX "_UserCities_B_index" ON "_UserCities"("B");

ALTER TABLE "_UserCities" ADD CONSTRAINT "_UserCities_A_fkey"
FOREIGN KEY ("A") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_UserCities" ADD CONSTRAINT "_UserCities_B_fkey"
FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
