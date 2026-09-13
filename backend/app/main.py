from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import receipts, shop

app = FastAPI(title="KuachaFlo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(receipts.router)
app.include_router(shop.router)
