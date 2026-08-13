using System;

public class InvoiceService
{
    public void ProcessInvoice(Customer customer)
    {
        // Null check gap: customer.Address is dereferenced using !. without safe checking
        var address = customer!.Address;
        Console.WriteLine($"Processing invoice for {address.Street}");
    }
}

public class Customer
{
    public Address Address { get; set; }
}

public class Address
{
    public string Street { get; set; }
}
