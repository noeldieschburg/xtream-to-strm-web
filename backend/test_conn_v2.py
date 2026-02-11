
import requests

url = "http://g4.power360.net:8000/player_api.php"
params = {
    "username": "064039296310",
    "password": "064039296310",
    "action": "get_live_categories"
}

print(f"Testing connection to {url}...")
try:
    response = requests.get(url, params=params, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Content Type: {response.headers.get('Content-Type')}")
    try:
        data = response.json()
        print(f"JSON Data length: {len(data)}")
        if len(data) > 0:
            print(f"First item: {data[0]}")
    except:
        print(f"Response is not JSON. Start of content: {response.text[:200]}")
except Exception as e:
    print(f"Error: {e}")
