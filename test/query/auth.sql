SELECT id,
       username,
       password_hash,
       email,
       email_verified,
       created_at,
       updated_at,
       language,
       first_name,
       last_name
FROM public.users
LIMIT 1000;

DELETE FROM users WHERE email = 'ceccarellim7@gmail.com'
