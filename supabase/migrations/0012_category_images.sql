-- ---------------------------------------------------------------------------
-- 0012: fotos de stock (Unsplash) para las categorías del catálogo (Paso 2)
-- ---------------------------------------------------------------------------

update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=70' where key = 'pintura';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?auto=format&fit=crop&w=800&q=70' where key = 'pisos_enchapes';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1581141849291-1125c7b692b5?auto=format&fit=crop&w=800&q=70' where key = 'drywall';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=800&q=70' where key = 'electricidad';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=800&q=70' where key = 'plomeria';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?auto=format&fit=crop&w=800&q=70' where key = 'mamposteria';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=800&q=70' where key = 'remodelacion_banos';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=800&q=70' where key = 'remodelacion_cocinas';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=800&q=70' where key = 'cubiertas';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1599619585752-c3edb42a414c?auto=format&fit=crop&w=800&q=70' where key = 'impermeabilizacion';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1601918774946-25832a4be0d6?auto=format&fit=crop&w=800&q=70' where key = 'piscinas';
update public.catalog_categories set image_path = 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=70' where key = 'obra_gris';
