import os
from dotenv import load_dotenv

load_dotenv()

def check_environment():
    """Check if all required environment variables are set"""
    required_vars = [
        "GEMINI_API_KEY",
        "GROQ_API_KEY", 
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_UPLOAD_PRESET",
        "MONGODB_URL"
    ]
    
    print("Checking environment variables...")
    missing_vars = []
    
    for var in required_vars:
        value = os.getenv(var)
        if value:
            print(f"✅ {var}: {'*' * min(len(value), 10)}...")
        else:
            print(f"❌ {var}: Not set")
            missing_vars.append(var)
    
    if missing_vars:
        print(f"\n❌ Missing environment variables: {', '.join(missing_vars)}")
        print("Please set these in your .env file")
        return False
    else:
        print("\n✅ All environment variables are set!")
        return True

if __name__ == "__main__":
    check_environment()