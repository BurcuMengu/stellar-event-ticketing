#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String};

#[contracttype]
pub enum DataKey {
    Admin,
    EventName,
    Total,
    Sold,
    Holder(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    SoldOut = 3,
    AlreadyHasTicket = 4,
    InvalidInput = 5,
}

// TTL management: keep storage from being archived on a long-lived deployment.
// Ledgers close roughly every 5s, so ~17_280 ledgers ≈ 1 day.
// Bump the TTL to ~30 days whenever it drops below ~7 days remaining.
const BUMP_THRESHOLD: u32 = 7 * 17_280; // ~7 days
const BUMP_AMOUNT: u32 = 30 * 17_280; // ~30 days

#[contract]
pub struct TicketContract;

#[contractimpl]
impl TicketContract {
    /// One-time setup of the event and its ticket capacity.
    ///
    /// Note: first-caller-wins. There are no admin-only functions, so this is
    /// acceptable here; do not add auth that could break the existing deployment.
    pub fn initialize(
        env: Env,
        admin: Address,
        event_name: String,
        total_tickets: u32,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        // Reject a zero capacity (permanently SoldOut) or an empty event name.
        if total_tickets == 0 || event_name.is_empty() {
            return Err(Error::InvalidInput);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::EventName, &event_name);
        env.storage().instance().set(&DataKey::Total, &total_tickets);
        env.storage().instance().set(&DataKey::Sold, &0u32);
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
        Ok(())
    }

    /// Buy a single ticket for `buyer`. Requires the buyer's authorization.
    pub fn buy_ticket(env: Env, buyer: Address) -> Result<u32, Error> {
        buyer.require_auth();

        let total: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Total)
            .ok_or(Error::NotInitialized)?;
        let mut sold: u32 = env.storage().instance().get(&DataKey::Sold).unwrap_or(0);

        if env.storage().persistent().has(&DataKey::Holder(buyer.clone())) {
            return Err(Error::AlreadyHasTicket);
        }
        if sold >= total {
            return Err(Error::SoldOut);
        }

        sold += 1;
        env.storage().instance().set(&DataKey::Sold, &sold);
        let holder_key = DataKey::Holder(buyer.clone());
        env.storage().persistent().set(&holder_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&holder_key, BUMP_THRESHOLD, BUMP_AMOUNT);
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);

        // Real-time event: frontend listens for this.
        env.events()
            .publish((symbol_short!("ticket"), symbol_short!("buy")), (buyer, sold));

        Ok(sold)
    }

    /// Returns (event_name, total, sold).
    pub fn get_info(env: Env) -> Result<(String, u32, u32), Error> {
        let name: String = env
            .storage()
            .instance()
            .get(&DataKey::EventName)
            .ok_or(Error::NotInitialized)?;
        let total: u32 = env.storage().instance().get(&DataKey::Total).unwrap_or(0);
        let sold: u32 = env.storage().instance().get(&DataKey::Sold).unwrap_or(0);
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
        Ok((name, total, sold))
    }

    /// Whether `addr` already holds a ticket.
    pub fn has_ticket(env: Env, addr: Address) -> bool {
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
        env.storage().persistent().has(&DataKey::Holder(addr))
    }
}

mod test;
