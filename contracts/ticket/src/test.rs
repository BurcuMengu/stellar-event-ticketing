#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};

fn setup() -> (Env, TicketContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TicketContract, ());
    let client = TicketContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin, &String::from_str(&env, "Stellar Meetup"), &2u32);
    (env, client, admin)
}

#[test]
fn test_initialize_and_info() {
    let (env, client, _admin) = setup();
    let (name, total, sold) = client.get_info();
    assert_eq!(name, String::from_str(&env, "Stellar Meetup"));
    assert_eq!(total, 2);
    assert_eq!(sold, 0);
}

#[test]
fn test_buy_ticket_happy_path() {
    let (env, client, _admin) = setup();
    let buyer = Address::generate(&env);
    let num = client.buy_ticket(&buyer);
    assert_eq!(num, 1);
    assert!(client.has_ticket(&buyer));
    let (_, _, sold) = client.get_info();
    assert_eq!(sold, 1);
}

#[test]
fn test_already_has_ticket() {
    let (env, client, _admin) = setup();
    let buyer = Address::generate(&env);
    client.buy_ticket(&buyer);
    let res = client.try_buy_ticket(&buyer);
    assert_eq!(res, Err(Ok(Error::AlreadyHasTicket)));
}

#[test]
fn test_sold_out() {
    let (env, client, _admin) = setup();
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    let b3 = Address::generate(&env);
    client.buy_ticket(&b1);
    client.buy_ticket(&b2);
    let res = client.try_buy_ticket(&b3);
    assert_eq!(res, Err(Ok(Error::SoldOut)));
}

#[test]
fn test_double_initialize_fails() {
    let (env, client, _admin) = setup();
    let admin2 = Address::generate(&env);
    let res = client.try_initialize(&admin2, &String::from_str(&env, "X"), &5u32);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}
