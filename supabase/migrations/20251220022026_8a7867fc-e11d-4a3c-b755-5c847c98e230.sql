-- Function to auto-assign media to categories based on genre
CREATE OR REPLACE FUNCTION public.auto_assign_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_genre TEXT;
  matching_category_id UUID;
BEGIN
  -- Only process if genres exist and category_id is not already set
  IF NEW.genres IS NOT NULL AND array_length(NEW.genres, 1) > 0 AND NEW.category_id IS NULL THEN
    -- Get the first genre
    first_genre := NEW.genres[1];
    
    -- Look for an existing category with this name for this user
    SELECT id INTO matching_category_id
    FROM public.categories
    WHERE LOWER(name) = LOWER(first_genre) AND user_id = NEW.user_id
    LIMIT 1;
    
    -- If no matching category exists, create one
    IF matching_category_id IS NULL THEN
      INSERT INTO public.categories (name, user_id, description)
      VALUES (first_genre, NEW.user_id, 'Auto-created from genre')
      RETURNING id INTO matching_category_id;
    END IF;
    
    -- Assign the category to the media
    NEW.category_id := matching_category_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for INSERT
CREATE TRIGGER auto_assign_category_on_insert
  BEFORE INSERT ON public.media
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_category();

-- Create trigger for UPDATE (when genres change and category is null)
CREATE TRIGGER auto_assign_category_on_update
  BEFORE UPDATE ON public.media
  FOR EACH ROW
  WHEN (OLD.genres IS DISTINCT FROM NEW.genres AND NEW.category_id IS NULL)
  EXECUTE FUNCTION public.auto_assign_category();