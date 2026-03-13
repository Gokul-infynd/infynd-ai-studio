import os
from supabase import create_client

url = "https://zfhbootnugrplxsznbvj.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmaGJvb3RudWdycGx4c3puYnZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDkyODUsImV4cCI6MjA4NzkyNTI4NX0.-v8D1LmRdU3oxGXlFdGFcArz2KDM2bv0SjYYo9jxRmU"
c = create_client(url, key)
try:
    print(c.auth.sign_up({'email': 'test@test.com', 'password': 'testpassword123'}))
except Exception as e:
    print(e)
