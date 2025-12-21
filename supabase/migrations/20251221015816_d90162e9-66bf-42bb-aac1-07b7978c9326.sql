-- Fix storage bucket security: make it private and remove public access policy

-- Make the bucket private
UPDATE storage.buckets SET public = false WHERE id = 'media-files';

-- Remove the overly permissive public policy that allows unauthenticated access
DROP POLICY IF EXISTS "Public can view media files" ON storage.objects;