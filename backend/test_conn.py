
import httpx
import asyncio

async def test_conn():
    url = "http://g4.power360.net:8000/player_api.php"
    params = {
        "username": "064039296310",
        "password": "REDACTED", # I'll get the real password from the previous step output if I need it, but I didn't print it.
        "action": "get_live_categories"
    }
    
    # Let me re-run the previous script to get the password first.
    pass

if __name__ == "__main__":
    # Actually I'll just write the full script with the password.
    pass
