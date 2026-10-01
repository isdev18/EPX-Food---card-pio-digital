INSERT INTO "PizzaSize" ("id", "restaurantId", "name", "slices", "maxFlavors", "priceMultiplier", "active")
SELECT CONCAT('family_', MD5(r."id")), r."id", 'Família', 12, 3, 1.50, TRUE
FROM "Restaurant" r
WHERE NOT EXISTS (
  SELECT 1 FROM "PizzaSize" s
  WHERE s."restaurantId" = r."id" AND LOWER(s."name") IN ('família', 'familia')
);
