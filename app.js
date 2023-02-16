require('dotenv').config();
const express = require('express');
const path = require("path");
const bodyParser = require('body-parser');
const moesif = require('moesif-nodejs');
const Stripe = require('stripe');
// npm i --save node-fetch@2.6.5
const fetch = require('node-fetch');

const app = express();

const port = 5001;
const stripe = Stripe(process.env.STRIPE_KEY);

var jsonParser = bodyParser.json();

const moesifMiddleware = moesif({
 applicationId: process.env.MOESIF_APPLICATION_ID
});

app.use(moesifMiddleware);

app.post('/register', jsonParser,
 async (req, res) => {
    // create Stripe customer
   const customer = await stripe.customers.create({
      email: req.body.email,
      name: `${req.body.firstname} ${req.body.lastname}`,
      description: 'Customer created through /register endpoint',
    });
    console.log('Stripe Customer: ' + req.body.email + ' is created with customer id: ' + customer.id)

    // create Stripe subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        { price: process.env.STRIPE_PRICE_KEY },
      ],
    });
    console.log('Stripe subscription created with subscription id: ' + subscription.id)

  // create user and company in Moesif
  var company = { companyId: subscription.id };
  moesifMiddleware.updateCompany(company);
  console.log('Company created in Moesif')

  var user = {
    userId: customer.id,
    companyId: subscription.id,
    metadata: {
      email: req.body.email,
      firstName: req.body.firstname,
      lastName: req.body.lastname,
      password: req.body.password,
    }
  };
  moesifMiddleware.updateUser(user);
  console.log('User created in Moesif')

  //create Kong consumer
  var body = { username: req.body.email, custom_id: customer.id };
  var response = await fetch(`${process.env.KONG_URL}/consumers/`, {
    method: 'post',
    body: JSON.stringify(body),
    headers: {'Content-Type': 'application/json','Kong-Admin-Token':'HWwljNtOuX'}
  });
  var data = await response.json();
  console.log('Kong consumer created')

  // send back a new API key for use
  var response = await fetch(`${process.env.KONG_URL}/consumers/${req.body.email}/key-auth`, {
    method: 'post',
    headers: {'Kong-Admin-Token':'HWwljNtOuX'}
  });
  var data = await response.json();
  var kongAPIKey = data.key;
  console.log('Kong created apiKey: ' + kongAPIKey)

  // add API key to users metadata in Moesif
  var user = {
    userId: customer.id,
    metadata: {
      apikey: kongAPIKey
    }
  };
  moesifMiddleware.updateUser(user);
  console.log('Added apiKey to User Metadata')

  res.status(200);
  res.send({ apikey: kongAPIKey });
 }
)
app.listen(port, () => {
 console.log(`Example app listening at http://localhost:${port}`);
})
