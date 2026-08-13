using System;
using System.Threading.Tasks;

public class InvoiceService
{
    public void ProcessInvoice(Customer customer)
    {
        // Null-Safety Smell: Overuse of null-forgiving operator !.
        var address = customer!.Address;
        Console.WriteLine($"Processing invoice for {address.Street}");
    }

    // Async Smell 1: Using "async void" instead of "async Task"
    public async void SendInvoiceReport()
    {
        // Async Smell 2: Blocking a task using ".Result" (causes deadlock risks)
        var status = FetchStatusAsync().Result;
        
        // Async Smell 3: Unawaited task call (missing await keyword)
        SaveLogAsync();
    }

    // SOLID Smell: Throwing NotImplementedException (violates Liskov Substitution Principle)
    public void DeleteInvoice(string id)
    {
        throw new NotImplementedException();
    }

    public async Task<string> FetchStatusAsync()
    {
        await Task.Delay(10);
        return "Success";
    }

    public async Task SaveLogAsync()
    {
        await Task.Delay(10);
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
