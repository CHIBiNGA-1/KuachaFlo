-- Category list change: "Personal care" + "Household" merge into one shelf,
-- and "Gadgets" joins, keeping the list at seven. No schema change —
-- category is a plain text column — this only rewrites existing rows so
-- they match the new dropdown. Safe to run more than once.
update products  set category = 'Personal care & household' where category in ('Personal care', 'Household');
update suppliers set category = 'Personal care & household' where category in ('Personal care', 'Household');
